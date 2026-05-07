import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  formatTimerDuration,
  getDevelopmentTimerRemainingSeconds,
  useDevelopmentTimerRuntime,
} from "../developmentTimerQueue";

function getTimerTone(remainingSeconds: number) {
  if (remainingSeconds <= 0) return "done";
  if (remainingSeconds <= 10) return "critical";
  if (remainingSeconds <= 60) return "warning";
  return "running";
}

type WakeLockSentinelLike = EventTarget & {
  readonly released: boolean;
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

function useScreenWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;

    const releaseWakeLock = async () => {
      const wakeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (wakeLock && !wakeLock.released) {
        await wakeLock.release().catch(() => undefined);
      }
    };

    const requestWakeLock = async () => {
      if (!enabledRef.current || document.visibilityState !== "visible") {
        await releaseWakeLock();
        return;
      }
      if (wakeLockRef.current && !wakeLockRef.current.released) return;

      const wakeLockApi = (navigator as NavigatorWithWakeLock).wakeLock;
      if (!wakeLockApi) return;

      try {
        const wakeLock = await wakeLockApi.request("screen");
        if (cancelled || !enabledRef.current) {
          await wakeLock.release().catch(() => undefined);
          return;
        }

        const handleRelease = () => {
          wakeLock.removeEventListener("release", handleRelease);
          if (wakeLockRef.current === wakeLock) {
            wakeLockRef.current = null;
          }
          if (!cancelled && enabledRef.current && document.visibilityState === "visible") {
            window.setTimeout(() => {
              void requestWakeLock();
            }, 0);
          }
        };

        wakeLock.addEventListener("release", handleRelease);
        wakeLockRef.current = wakeLock;
      } catch {
        wakeLockRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      void requestWakeLock();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void requestWakeLock();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [enabled]);
}

export function DevelopmentTimerPage() {
  const { user } = useAuth();
  const {
    items,
    setItems,
    removeItem,
    clear,
    session,
    elapsedSeconds,
    completeCount,
    allComplete,
    setSession,
  } = useDevelopmentTimerRuntime(user?.id);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const running = session.running;
  useScreenWakeLock(running && items.length > 0);

  useEffect(() => {
    if (running && allComplete) {
      setSession({ running: false, startedAt: session.startedAt });
    }
  }, [allComplete, running, session.startedAt, setSession]);

  const handleStart = () => {
    if (items.length === 0) return;
    setSession({ running: true, startedAt: Date.now() });
  };

  const handleReset = () => {
    setSession({ running: false, startedAt: null });
  };

  const handleClear = () => {
    clear();
    setSession({ running: false, startedAt: null });
  };

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const fromIndex = items.findIndex((item) => item.id === draggedId);
    const toIndex = items.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedId(null);
      return;
    }

    const nextItems = [...items];
    const [moved] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, moved);
    setItems(nextItems);
    setDraggedId(null);
  };

  return (
    <div className="development-timer-page">
      <header className="development-timer-header">
        <div>
          <p className="development-timer-kicker">Darkroom timer</p>
          <h1>Development Timer</h1>
          <p className="development-timer-subtitle">
            {items.length === 0
              ? "Add exposed film holders or processed rolls from the Film views."
              : `${items.length} item${items.length === 1 ? "" : "s"} queued · ${completeCount} complete`}
          </p>
        </div>
        <div className="development-timer-actions">
          <button className="development-timer-start" type="button" onClick={handleStart} disabled={items.length === 0 || running}>
            {running ? "Running" : allComplete ? "Start again" : "Start all"}
          </button>
          <button className="development-timer-secondary" type="button" onClick={handleReset} disabled={items.length === 0 || (!running && session.startedAt == null)}>
            Reset
          </button>
          <button className="development-timer-secondary" type="button" onClick={handleClear} disabled={running || items.length === 0}>
            Clear
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <section className="development-timer-empty">
          <p>No development timers queued.</p>
          <Link to="/app/film/holders">Go to Film Holders</Link>
        </section>
      ) : (
        <section className="development-timer-grid" aria-label="Queued development timers">
          {items.map((item, index) => {
            const remainingSeconds = getDevelopmentTimerRemainingSeconds(item, elapsedSeconds);
            const tone = getTimerTone(remainingSeconds);
            return (
              <article
                key={item.id}
                className={`development-timer-card development-timer-card--${tone}`}
                draggable={!running}
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(item.id)}
                data-dragging={draggedId === item.id ? "true" : "false"}
              >
                <div className="development-timer-card-top">
                  <button
                    className="development-timer-drag"
                    type="button"
                    aria-label="Drag to reorder"
                    disabled={running}
                  >
                    ⋮⋮
                  </button>
                  <span className="development-timer-index">{index + 1}</span>
                  <button
                    className="development-timer-remove"
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={running}
                  >
                    Remove
                  </button>
                </div>
                <div className="development-timer-card-main">
                  <h2>{item.filmHolderName}</h2>
                  <p>{item.filmName}</p>
                  {item.photographTitle && <p className="development-timer-photo">{item.photographTitle}</p>}
                  {item.exposureSummary && <p className="development-timer-exposure">{item.exposureSummary}</p>}
                </div>
                <div className="development-timer-countdown" data-tone={tone}>
                  {formatTimerDuration(remainingSeconds)}
                </div>
                <div className="development-timer-target">
                  Target {item.developmentLabel}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
