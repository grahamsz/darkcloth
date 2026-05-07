import { useCallback, useEffect, useMemo, useState } from "react";

const TIMER_QUEUE_EVENT = "darkcloth:development-timer-queue";
const TIMER_QUEUE_LIMIT = 6;
const TIMER_ENDING_SOON_SECONDS = 60;

export interface DevelopmentTimerSession {
  running: boolean;
  startedAt: number | null;
}

export interface DevelopmentTimerQueueItem {
  id: string;
  filmHolderId: string;
  filmHolderName: string;
  filmName: string;
  photographId: string | null;
  photographTitle: string | null;
  exposureSummary: string | null;
  developmentSeconds: number;
  developmentLabel: string;
  addedAt: string;
}

export interface AddDevelopmentTimerQueueItemResult {
  ok: boolean;
  message: string;
  items: DevelopmentTimerQueueItem[];
}

function storageKey(userId: string) {
  return `darkcloth:development-timer-queue:${userId}`;
}

function sessionStorageKey(userId: string) {
  return `darkcloth:development-timer-session:${userId}`;
}

function emitQueueChanged(userId: string) {
  window.dispatchEvent(new CustomEvent(TIMER_QUEUE_EVENT, { detail: { userId } }));
}

function normalizeQueueItem(value: unknown): DevelopmentTimerQueueItem | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Partial<DevelopmentTimerQueueItem>;
  if (!item.id || typeof item.id !== "string") return null;
  if (!item.filmHolderId || typeof item.filmHolderId !== "string") return null;
  if (!item.filmHolderName || typeof item.filmHolderName !== "string") return null;
  if (!item.filmName || typeof item.filmName !== "string") return null;
  if (typeof item.developmentSeconds !== "number" || !Number.isFinite(item.developmentSeconds) || item.developmentSeconds <= 0) return null;
  return {
    id: item.id,
    filmHolderId: item.filmHolderId,
    filmHolderName: item.filmHolderName,
    filmName: item.filmName,
    photographId: typeof item.photographId === "string" ? item.photographId : null,
    photographTitle: typeof item.photographTitle === "string" ? item.photographTitle : null,
    exposureSummary: typeof item.exposureSummary === "string" ? item.exposureSummary : null,
    developmentSeconds: Math.max(1, Math.round(item.developmentSeconds)),
    developmentLabel: typeof item.developmentLabel === "string" && item.developmentLabel.trim()
      ? item.developmentLabel
      : formatTimerDuration(item.developmentSeconds),
    addedAt: typeof item.addedAt === "string" ? item.addedAt : new Date().toISOString(),
  };
}

export function formatTimerDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const totalSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function getDevelopmentTimerRemainingSeconds(item: DevelopmentTimerQueueItem, elapsedSeconds: number) {
  return Math.max(0, item.developmentSeconds - elapsedSeconds);
}

export function hasDevelopmentTimerEndingSoon(items: DevelopmentTimerQueueItem[], elapsedSeconds: number) {
  return items.some((item) => {
    const remainingSeconds = getDevelopmentTimerRemainingSeconds(item, elapsedSeconds);
    return remainingSeconds > 0 && remainingSeconds <= TIMER_ENDING_SOON_SECONDS;
  });
}

export function readDevelopmentTimerSession(userId: string | null | undefined): DevelopmentTimerSession {
  if (!userId || typeof localStorage === "undefined") return { running: false, startedAt: null };
  try {
    const raw = localStorage.getItem(sessionStorageKey(userId));
    if (!raw) return { running: false, startedAt: null };
    const parsed = JSON.parse(raw) as Partial<DevelopmentTimerSession>;
    const startedAt = typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt)
      ? parsed.startedAt
      : null;
    return {
      running: parsed.running === true && startedAt != null,
      startedAt,
    };
  } catch {
    return { running: false, startedAt: null };
  }
}

export function writeDevelopmentTimerSession(userId: string, session: DevelopmentTimerSession) {
  localStorage.setItem(sessionStorageKey(userId), JSON.stringify(session));
  emitQueueChanged(userId);
}

export function readDevelopmentTimerQueue(userId: string | null | undefined): DevelopmentTimerQueueItem[] {
  if (!userId || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeQueueItem).filter((item): item is DevelopmentTimerQueueItem => item != null);
  } catch {
    return [];
  }
}

export function writeDevelopmentTimerQueue(userId: string, items: DevelopmentTimerQueueItem[]) {
  const normalized = items.slice(0, TIMER_QUEUE_LIMIT);
  localStorage.setItem(storageKey(userId), JSON.stringify(normalized));
  emitQueueChanged(userId);
}

export function addDevelopmentTimerQueueItem(
  userId: string,
  item: DevelopmentTimerQueueItem,
): AddDevelopmentTimerQueueItemResult {
  const items = readDevelopmentTimerQueue(userId);
  if (items.some((current) => current.id === item.id)) {
    return { ok: false, message: "That film holder is already in the timer.", items };
  }
  if (items.length >= TIMER_QUEUE_LIMIT) {
    return { ok: false, message: `The development timer can hold up to ${TIMER_QUEUE_LIMIT} film holders.`, items };
  }

  const nextItems = [...items, {
    ...item,
    developmentSeconds: Math.max(1, Math.round(item.developmentSeconds)),
  }];
  writeDevelopmentTimerQueue(userId, nextItems);
  return { ok: true, message: "Added to development timer.", items: nextItems };
}

export function useDevelopmentTimerRuntime(userId: string | null | undefined) {
  const { items, setItems, removeItem, clear } = useDevelopmentTimerQueue(userId);
  const [session, setSession] = useState<DevelopmentTimerSession>(() => readDevelopmentTimerSession(userId));
  const [now, setNow] = useState(() => Date.now());

  const refreshSession = useCallback(() => {
    setSession(readDevelopmentTimerSession(userId));
  }, [userId]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!userId) return undefined;
    const handleQueueEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: string }>;
      if (customEvent.detail?.userId && customEvent.detail.userId !== userId) return;
      refreshSession();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === sessionStorageKey(userId)) refreshSession();
    };
    window.addEventListener(TIMER_QUEUE_EVENT, handleQueueEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(TIMER_QUEUE_EVENT, handleQueueEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshSession, userId]);

  useEffect(() => {
    if (!session.running) return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [session.running]);

  const elapsedSeconds = session.startedAt != null
    ? Math.max(0, (now - session.startedAt) / 1000)
    : 0;
  const completeCount = items.filter((item) => getDevelopmentTimerRemainingSeconds(item, elapsedSeconds) <= 0).length;
  const allComplete = items.length > 0 && completeCount === items.length;
  const endingSoon = session.running && hasDevelopmentTimerEndingSoon(items, elapsedSeconds);

  const setSessionForUser = useCallback((nextSession: DevelopmentTimerSession) => {
    if (!userId) return;
    writeDevelopmentTimerSession(userId, nextSession);
    setSession(nextSession);
    setNow(Date.now());
  }, [userId]);

  return {
    items,
    setItems,
    removeItem,
    clear,
    session,
    elapsedSeconds,
    completeCount,
    allComplete,
    endingSoon,
    setSession: setSessionForUser,
  };
}

export function useDevelopmentTimerQueue(userId: string | null | undefined) {
  const [items, setQueueItems] = useState<DevelopmentTimerQueueItem[]>(() => readDevelopmentTimerQueue(userId));

  const refresh = useCallback(() => {
    setQueueItems(readDevelopmentTimerQueue(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return undefined;
    const handleQueueEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: string }>;
      if (customEvent.detail?.userId && customEvent.detail.userId !== userId) return;
      refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey(userId)) refresh();
    };
    window.addEventListener(TIMER_QUEUE_EVENT, handleQueueEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(TIMER_QUEUE_EVENT, handleQueueEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh, userId]);

  const actions = useMemo(() => ({
    setItems: (nextItems: DevelopmentTimerQueueItem[]) => {
      if (!userId) return;
      writeDevelopmentTimerQueue(userId, nextItems);
      setQueueItems(readDevelopmentTimerQueue(userId));
    },
    addItem: (item: DevelopmentTimerQueueItem) => {
      if (!userId) return { ok: false, message: "Sign in is required to use the development timer.", items };
      const result = addDevelopmentTimerQueueItem(userId, item);
      setQueueItems(result.items);
      return result;
    },
    removeItem: (id: string) => {
      if (!userId) return;
      const nextItems = readDevelopmentTimerQueue(userId).filter((item) => item.id !== id);
      writeDevelopmentTimerQueue(userId, nextItems);
      setQueueItems(nextItems);
    },
    clear: () => {
      if (!userId) return;
      writeDevelopmentTimerQueue(userId, []);
      setQueueItems([]);
    },
  }), [items, userId]);

  return { items, ...actions };
}
