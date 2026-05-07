type ServiceWorkerContainerLike = Pick<ServiceWorkerContainer, "register"> & {
  addEventListener?: (type: "controllerchange", listener: () => void) => void;
  controller?: ServiceWorkerMessageTarget | null;
  ready?: Promise<unknown>;
  removeEventListener?: (type: "controllerchange", listener: () => void) => void;
};

type ServiceWorkerMessageTarget = {
  postMessage?: (message: unknown) => void;
};

type ServiceWorkerRegistrationLike = {
  active?: ServiceWorkerMessageTarget | null;
  installing?: ServiceWorkerMessageTarget | null;
  update?: () => Promise<unknown> | unknown;
  waiting?: ServiceWorkerMessageTarget | null;
};

const APP_SHELL_READY_MESSAGE = "DARKCLOTH_APP_SHELL_READY";

export interface ServiceWorkerRegistrationDiagnostics {
  attemptCount: number;
  isProduction: boolean | null;
  isSecureContext: boolean | null;
  lastAttemptAt: string | null;
  lastErrorMessage: string | null;
  lastErrorName: string | null;
  lastResult: string;
  scope: string;
  scriptUrl: string;
}

const serviceWorkerRegistrationDiagnostics: ServiceWorkerRegistrationDiagnostics = {
  attemptCount: 0,
  isProduction: null,
  isSecureContext: null,
  lastAttemptAt: null,
  lastErrorMessage: null,
  lastErrorName: null,
  lastResult: "not-started",
  scope: "/",
  scriptUrl: "/sw.js",
};

export interface RegisterServiceWorkerOptions {
  isProduction?: boolean;
  isSecureContext?: boolean;
  readyTimeoutMs?: number;
  serviceWorker?: ServiceWorkerContainerLike | null;
  scriptUrl?: string;
  scope?: string;
}

interface ServiceWorkerRegistrationRuntime {
  addEventListener?: (type: "focus" | "online", listener: () => void) => void;
  removeEventListener?: (type: "focus" | "online", listener: () => void) => void;
}

export interface StartServiceWorkerRegistrationOptions extends RegisterServiceWorkerOptions {
  retryDelayMs?: number;
  runtime?: ServiceWorkerRegistrationRuntime | null;
}

function resolveDefaultOptions(): Required<Pick<RegisterServiceWorkerOptions, "isProduction" | "isSecureContext">> & {
  serviceWorker: RegisterServiceWorkerOptions["serviceWorker"];
} {
  const meta = import.meta as ImportMeta & { env?: { PROD?: boolean } };
  const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : false;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isLocalDevHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  return {
    isProduction: Boolean(meta.env?.PROD) || (isSecureContext && !isLocalDevHost),
    isSecureContext,
    serviceWorker:
      typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? navigator.serviceWorker
        : null,
  };
}

function currentAppShellRevision() {
  try {
    return new URL(import.meta.url).pathname;
  } catch {
    return null;
  }
}

function updateServiceWorkerRegistrationDiagnostics(
  patch: Partial<ServiceWorkerRegistrationDiagnostics>,
) {
  Object.assign(serviceWorkerRegistrationDiagnostics, patch);
}

export function readServiceWorkerRegistrationDiagnostics(): ServiceWorkerRegistrationDiagnostics {
  return { ...serviceWorkerRegistrationDiagnostics };
}

function notifyServiceWorkerAppShellReady(
  serviceWorker: NonNullable<RegisterServiceWorkerOptions["serviceWorker"]>,
  registration: ServiceWorkerRegistrationLike,
) {
  const message = {
    type: APP_SHELL_READY_MESSAGE,
    revision: currentAppShellRevision(),
  };
  const targets = new Set<ServiceWorkerMessageTarget | null | undefined>([
    serviceWorker.controller,
    registration.active,
    registration.waiting,
    registration.installing,
  ]);

  for (const target of targets) {
    target?.postMessage?.(message);
  }
}

async function waitForReadyServiceWorkerControl(
  serviceWorker: NonNullable<RegisterServiceWorkerOptions["serviceWorker"]>,
  readyTimeoutMs: number,
): Promise<boolean> {
  if (serviceWorker.ready) {
    const ready = await Promise.race([
      serviceWorker.ready.then(() => true).catch(() => false),
      new Promise<boolean>((resolve) => globalThis.setTimeout(() => resolve(false), readyTimeoutMs)),
    ]);
    if (!ready) {
      return false;
    }
  }

  if (serviceWorker.controller || !serviceWorker.addEventListener || !serviceWorker.removeEventListener) {
    return true;
  }

  await new Promise<void>((resolve) => {
    const timeout = globalThis.setTimeout(() => {
      serviceWorker.removeEventListener?.("controllerchange", handleControllerChange);
      resolve();
    }, 5_000);
    const handleControllerChange = () => {
      globalThis.clearTimeout(timeout);
      serviceWorker.removeEventListener?.("controllerchange", handleControllerChange);
      resolve();
    };

    serviceWorker.addEventListener?.("controllerchange", handleControllerChange);
  });
  return true;
}

export async function registerServiceWorker(options: RegisterServiceWorkerOptions = {}): Promise<boolean> {
  const defaults = resolveDefaultOptions();
  const isProduction = options.isProduction ?? defaults.isProduction;
  const isSecureContext = options.isSecureContext ?? defaults.isSecureContext;
  const readyTimeoutMs = options.readyTimeoutMs ?? 3_000;
  const serviceWorker = options.serviceWorker ?? defaults.serviceWorker;
  const scriptUrl = options.scriptUrl ?? "/sw.js";
  const scope = options.scope ?? "/";

  updateServiceWorkerRegistrationDiagnostics({
    attemptCount: serviceWorkerRegistrationDiagnostics.attemptCount + 1,
    isProduction,
    isSecureContext,
    lastAttemptAt: new Date().toISOString(),
    lastErrorMessage: null,
    lastErrorName: null,
    lastResult: "starting",
    scope,
    scriptUrl,
  });

  if (!isProduction || !isSecureContext || !serviceWorker) {
    updateServiceWorkerRegistrationDiagnostics({
      lastResult: !isProduction
        ? "skipped:not-production"
        : !isSecureContext
          ? "skipped:insecure-context"
          : "skipped:no-service-worker-container",
    });
    return false;
  }

  try {
    const registration = await serviceWorker.register(scriptUrl, {
      scope,
      updateViaCache: "none",
    }) as ServiceWorkerRegistrationLike;
    await registration.update?.();
    const ready = await waitForReadyServiceWorkerControl(serviceWorker, readyTimeoutMs);
    if (!ready) {
      updateServiceWorkerRegistrationDiagnostics({
        lastResult: "registered:not-ready",
      });
      return false;
    }
    notifyServiceWorkerAppShellReady(serviceWorker, registration);
    updateServiceWorkerRegistrationDiagnostics({
      lastResult: "registered:ready",
    });
    return true;
  } catch (err) {
    updateServiceWorkerRegistrationDiagnostics({
      lastErrorMessage: err instanceof Error ? err.message : String(err),
      lastErrorName: err instanceof Error ? err.name : typeof err,
      lastResult: "failed",
    });
    return false;
  }
}

export function startServiceWorkerRegistration(options: StartServiceWorkerRegistrationOptions = {}): () => void {
  const runtime = options.runtime ?? (typeof window !== "undefined" ? window : null);
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  let stopped = false;
  let running = false;
  let registered = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = () => {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = () => {
    if (stopped || registered || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void run();
    }, retryDelayMs);
  };

  const run = async () => {
    if (stopped || running || registered) return;
    running = true;
    try {
      registered = await registerServiceWorker(options);
      if (!registered) {
        scheduleRetry();
      }
    } finally {
      running = false;
    }
  };

  const retryNow = () => {
    clearRetry();
    void run();
  };

  runtime?.addEventListener?.("focus", retryNow);
  runtime?.addEventListener?.("online", retryNow);
  void run();

  return () => {
    stopped = true;
    clearRetry();
    runtime?.removeEventListener?.("focus", retryNow);
    runtime?.removeEventListener?.("online", retryNow);
  };
}
