import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatBulbDurationInputValue,
  formatBulbTimerStatus,
  parseBulbDurationInput,
  type BulbTimerPhase,
} from "../photoExposure";

const BULB_TIMER_PRECOUNT_SECONDS = 3;
const BULB_TIMER_TICK_MS = 33;

interface BulbTimerFieldProps {
  duration: string;
  onDurationChange: (value: string) => void;
  onRunningChange?: (running: boolean) => void;
  disabled?: boolean;
}

export function BulbTimerField({
  duration,
  onDurationChange,
  onRunningChange,
  disabled = false,
}: BulbTimerFieldProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<BulbTimerPhase>("idle");
  const [tick, setTick] = useState(0);
  const countdownDeadlineRef = useRef<number | null>(null);
  const exposureDeadlineRef = useRef<number | null>(null);
  const scheduledDurationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const modalHistoryPushedRef = useRef(false);

  const parsedDuration = useMemo(() => parseBulbDurationInput(duration), [duration]);
  const isRunning = phase === "precount" || phase === "exposing";
  const primaryLabel = phase === "complete"
    ? "Start again"
    : phase === "precount"
      ? "Starting…"
      : phase === "exposing"
        ? "Running…"
        : "Start bulb timer";
  const secondaryLabel = phase === "precount" ? "Cancel" : "Stop";

  const getAudioContext = () => {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextClass = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass();
    audioContextRef.current = context;
    return context;
  };

  const primeAudio = () => {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      void context.resume();
    }
  };

  const playClick = (frequency: number) => {
    const context = getAudioContext();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.055);
  };

  useEffect(() => {
    onRunningChange?.(isRunning);
  }, [isRunning, onRunningChange]);

  useEffect(() => {
    return () => {
      onRunningChange?.(false);
      void audioContextRef.current?.close();
    };
  }, [onRunningChange]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    window.history.pushState({ darkclothModal: "bulb-timer" }, "", window.location.href);
    modalHistoryPushedRef.current = true;
    const handlePopState = () => {
      modalHistoryPushedRef.current = false;
      setOpen(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (modalHistoryPushedRef.current) {
        modalHistoryPushedRef.current = false;
        window.history.back();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!isRunning) return;
    const intervalId = window.setInterval(() => setTick(value => value + 1), BULB_TIMER_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  useEffect(() => {
    if (phase === "precount" && countdownDeadlineRef.current != null) {
      if (Date.now() >= countdownDeadlineRef.current) {
        const durationSeconds = scheduledDurationRef.current;
        if (durationSeconds == null) {
          countdownDeadlineRef.current = null;
          setPhase("idle");
          return;
        }
        exposureDeadlineRef.current = Date.now() + durationSeconds * 1000;
        playClick(1040);
        setPhase("exposing");
      }
    } else if (phase === "exposing" && exposureDeadlineRef.current != null) {
      const durationSeconds = scheduledDurationRef.current;
      if (Date.now() >= exposureDeadlineRef.current) {
        playClick(520);
        setPhase("complete");
        if (durationSeconds != null) {
          onDurationChange(formatBulbDurationInputValue(durationSeconds));
        }
      }
    }
  }, [tick, phase, onDurationChange]);

  useEffect(() => {
    if (phase !== "complete" || scheduledDurationRef.current == null) return;
    const scheduledValue = formatBulbDurationInputValue(scheduledDurationRef.current);
    const currentValue = parsedDuration == null ? "" : formatBulbDurationInputValue(parsedDuration);
    if (currentValue !== scheduledValue) {
      countdownDeadlineRef.current = null;
      exposureDeadlineRef.current = null;
      scheduledDurationRef.current = null;
      setPhase("idle");
      setTick(value => value + 1);
    }
  }, [phase, parsedDuration]);

  const startTimer = () => {
    if (disabled || isRunning || parsedDuration == null) return;

    primeAudio();
    setOpen(true);
    scheduledDurationRef.current = parsedDuration;
    countdownDeadlineRef.current = Date.now() + BULB_TIMER_PRECOUNT_SECONDS * 1000;
    exposureDeadlineRef.current = null;
    setPhase("precount");
    setTick(value => value + 1);
  };

  const stopTimer = () => {
    if (phase === "exposing") {
      playClick(520);
    }
    countdownDeadlineRef.current = null;
    exposureDeadlineRef.current = null;
    scheduledDurationRef.current = null;
    setPhase("idle");
    setTick(value => value + 1);
  };

  const snapshot = useMemo(() => {
    const precountRemaining = phase === "precount" && countdownDeadlineRef.current != null
      ? Math.max(1, Math.ceil((countdownDeadlineRef.current - Date.now()) / 1000))
      : null;
    const exposureRemainingSeconds = phase === "exposing" && exposureDeadlineRef.current != null
      ? Math.max(0, (exposureDeadlineRef.current - Date.now()) / 1000)
      : null;

    return {
      phase,
      durationSeconds: phase === "complete" ? scheduledDurationRef.current : parsedDuration,
      precountRemaining,
      exposureRemainingSeconds,
    };
  }, [phase, parsedDuration, tick]);

  const status = formatBulbTimerStatus(snapshot);

  const modal = open ? (
    <div
      className={`bulb-timer-overlay bulb-timer-overlay--${phase}`}
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <section
        className={`bulb-timer bulb-timer--${phase}`}
        data-phase={phase}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bulb-timer__topbar">
          <div>
            <div className="bulb-timer__eyebrow">Bulb timer</div>
            <h2 id={titleId} className="bulb-timer__duration">
              {parsedDuration == null ? "No duration" : `${formatBulbDurationInputValue(parsedDuration)}s`}
            </h2>
          </div>
          <button
            type="button"
            className="bulb-timer__close"
            onClick={() => setOpen(false)}
            aria-label="Close bulb timer"
          >
            ×
          </button>
        </div>
        <div className="bulb-timer__status" aria-live="polite" aria-atomic="true">
          <div className="bulb-timer__status-value">{status.title}</div>
          {status.detail && <div className="bulb-timer__status-note">{status.detail}</div>}
        </div>
        <div className="bulb-timer__controls">
          <button
            type="button"
            className="btn-primary"
            onClick={startTimer}
            disabled={disabled || isRunning || parsedDuration == null}
          >
            {primaryLabel}
          </button>
          {isRunning && (
            <button
              type="button"
              className="btn-secondary"
              onClick={stopTimer}
              disabled={disabled}
              aria-label={phase === "precount" ? "Cancel countdown" : "Stop exposure"}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div className="bulb-timer-launcher">
      <button
        type="button"
        className="link-btn bulb-timer-open"
        onClick={() => {
          primeAudio();
          setOpen(true);
        }}
        disabled={disabled || parsedDuration == null}
      >
        {isRunning ? "Show Bulb Timer >" : "Bulb Timer >"}
      </button>
      {modal ? createPortal(modal, document.body) : null}
      {isRunning && !open && (
        <div className="bulb-timer-inline-status" aria-live="polite">
          <span>{status.title}</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => setOpen(true)}
            disabled={disabled}
          >
            Show
          </button>
        </div>
      )}
    </div>
  );
}
