import type { SyncQueueCounts } from "./schema";

export type ConnectivityTransportStatus = "online" | "offline";
export type ConnectivitySyncStatus = "synced" | "pending_sync" | "syncing" | "sync_failed";
export type ConnectivityCheckReason = "startup" | "focus" | "online" | "manual";
export type ConnectivityTone = "positive" | "neutral" | "warning" | "danger";

export interface ConnectivityState {
  transportStatus: ConnectivityTransportStatus;
  syncStatus: ConnectivitySyncStatus;
  pendingCount: number;
  failedCount: number;
  lastCheckedAt: string | null;
  lastError: string | null;
  lastCheckReason: ConnectivityCheckReason | null;
}

export interface ConnectivityView {
  primaryLabel: string;
  secondaryLabel: string;
  tone: ConnectivityTone;
  summaryLabel: string;
  isRetryDisabled: boolean;
}

export interface HealthCheckResponse {
  ok: boolean;
  service: string;
}

export interface ConnectivityDependencies {
  healthCheck: () => Promise<HealthCheckResponse>;
  readSyncQueueCounts: () => Promise<SyncQueueCounts>;
  getBrowserOnline?: () => boolean;
  now?: () => string;
  transportRetryDelayMs?: number;
}

export function deriveConnectivitySyncStatus(
  pendingCount: number,
  failedCount: number,
  syncing: boolean,
): ConnectivitySyncStatus {
  if (syncing) {
    return "syncing";
  }

  if (failedCount > 0) {
    return "sync_failed";
  }

  if (pendingCount > 0) {
    return "pending_sync";
  }

  return "synced";
}

export function describeConnectivity(state: ConnectivityState): ConnectivityView {
  const transportLabel = state.transportStatus === "online" ? "Online" : "Offline";
  const countsLabel = `${state.pendingCount} pending · ${state.failedCount} failed`;

  let primaryLabel: string;
  let tone: ConnectivityTone;

  if (state.syncStatus === "syncing") {
    primaryLabel = "Syncing";
    tone = "neutral";
  } else if (state.syncStatus === "sync_failed") {
    primaryLabel = "Sync failed";
    tone = "danger";
  } else if (state.transportStatus === "offline") {
    primaryLabel = "Offline";
    tone = state.pendingCount > 0 ? "warning" : "neutral";
  } else if (state.pendingCount > 0) {
    primaryLabel = `${state.pendingCount} changes pending`;
    tone = "warning";
  } else {
    primaryLabel = "Synced";
    tone = "positive";
  }

  return {
    primaryLabel,
    secondaryLabel: `${transportLabel} · ${countsLabel}`,
    tone,
    summaryLabel: `${primaryLabel}. ${transportLabel} · ${countsLabel}.`,
    isRetryDisabled: state.syncStatus === "syncing",
  };
}

function createDefaultState(browserOnline: boolean): ConnectivityState {
  return {
    transportStatus: browserOnline ? "online" : "offline",
    syncStatus: "synced",
    pendingCount: 0,
    failedCount: 0,
    lastCheckedAt: null,
    lastError: null,
    lastCheckReason: null,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Health check failed";
}

export class ConnectivityController {
  private state: ConnectivityState;

  private readonly listeners = new Set<() => void>();

  private requestId = 0;

  private disposed = false;

  private transportRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ConnectivityDependencies, initialState: Partial<ConnectivityState> = {}) {
    const browserOnline = deps.getBrowserOnline?.() ?? true;
    this.state = {
      ...createDefaultState(browserOnline),
      ...initialState,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ConnectivityState => this.state;

  dispose = () => {
    this.disposed = true;
    this.clearTransportRetry();
    this.listeners.clear();
    this.requestId += 1;
  };

  bootstrap = async (): Promise<void> => {
    await this.refresh("startup");
  };

  retry = async (): Promise<void> => {
    await this.refresh("manual");
  };

  markBrowserOffline = (): void => {
    this.requestId += 1;
    this.clearTransportRetry();
    this.updateState((current) => ({
      ...current,
      transportStatus: "offline",
      syncStatus: deriveConnectivitySyncStatus(current.pendingCount, current.failedCount, false),
      lastError: "Browser reported offline",
    }));
  };

  markBrowserOnline = async (): Promise<void> => {
    await this.refresh("online");
  };

  private updateState(updater: (state: ConnectivityState) => ConnectivityState): void {
    if (this.disposed) {
      return;
    }

    this.state = updater(this.state);
    for (const listener of this.listeners) {
      listener();
    }
  }

  private clearTransportRetry(): void {
    if (!this.transportRetryTimer) return;
    clearTimeout(this.transportRetryTimer);
    this.transportRetryTimer = null;
  }

  private scheduleTransportRetry(): void {
    if (this.transportRetryTimer || this.disposed) return;

    const delayMs = this.deps.transportRetryDelayMs ?? 2_000;
    this.transportRetryTimer = setTimeout(() => {
      this.transportRetryTimer = null;
      if (this.disposed) return;
      void this.refresh("manual");
    }, delayMs);
  }

  private async refresh(reason: ConnectivityCheckReason): Promise<void> {
    const requestId = ++this.requestId;

    this.updateState((current) => ({
      ...current,
      syncStatus: "syncing",
      lastError: null,
      lastCheckReason: reason,
    }));

    const [healthResult, countResult] = await Promise.allSettled([
      this.deps.healthCheck(),
      this.deps.readSyncQueueCounts(),
    ]);

    if (this.disposed || requestId !== this.requestId) {
      return;
    }

    const counts = countResult.status === "fulfilled" ? countResult.value : { pendingCount: 0, failedCount: 0 };
    const healthOk = healthResult.status === "fulfilled" && healthResult.value.ok;
    if (healthOk) {
      this.clearTransportRetry();
    } else {
      this.scheduleTransportRetry();
    }

    this.updateState((current) => ({
      ...current,
      transportStatus: healthOk ? "online" : "offline",
      syncStatus: deriveConnectivitySyncStatus(counts.pendingCount, counts.failedCount, false),
      pendingCount: counts.pendingCount,
      failedCount: counts.failedCount,
      lastCheckedAt: this.deps.now?.() ?? new Date().toISOString(),
      lastError: healthOk ? null : errorMessage(healthResult.status === "rejected" ? healthResult.reason : healthResult.value),
      lastCheckReason: reason,
    }));
  }
}

export function createConnectivityController(
  deps: ConnectivityDependencies,
  initialState: Partial<ConnectivityState> = {},
): ConnectivityController {
  return new ConnectivityController(deps, initialState);
}
