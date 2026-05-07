import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker, startServiceWorkerRegistration } from "./pwa";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerServiceWorker", () => {
  it("skips registration when the build is not production or the context is insecure", async () => {
    const register = vi.fn();

    await expect(
      registerServiceWorker({
        isProduction: false,
        isSecureContext: true,
        serviceWorker: { register },
      }),
    ).resolves.toBe(false);

    expect(register).not.toHaveBeenCalled();
  });

  it("registers the service worker when the build is production and the context is secure", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const ready = Promise.resolve({});
    const register = vi.fn().mockResolvedValue({ update });

    await expect(
      registerServiceWorker({
        isProduction: true,
        isSecureContext: true,
        serviceWorker: { controller: { postMessage }, ready, register },
      }),
    ).resolves.toBe(true);

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "DARKCLOTH_APP_SHELL_READY" }));
  });

  it("registers on deployed secure origins even if the build production flag is false", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const ready = Promise.resolve({});
    const register = vi.fn().mockResolvedValue({ update });
    const originalWindow = globalThis.window;
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { hostname: "darkcloth.zone" },
    });

    try {
      await expect(
        registerServiceWorker({
          serviceWorker: { controller: { postMessage }, ready, register },
        }),
      ).resolves.toBe(true);
    } finally {
      vi.stubGlobal("window", originalWindow);
    }

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("waits for service worker control when the page is not controlled yet", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const register = vi.fn().mockResolvedValue({ active: { postMessage }, update });
    const listeners = new Map<string, () => void>();
    const serviceWorker = {
      controller: null,
      ready: Promise.resolve({}),
      register,
      addEventListener: vi.fn((event: "controllerchange", listener: () => void) => {
        listeners.set(event, listener);
      }),
      removeEventListener: vi.fn(),
    };

    const result = registerServiceWorker({
      isProduction: true,
      isSecureContext: true,
      serviceWorker,
    });
    const listener = await vi.waitUntil(() => listeners.get("controllerchange"));
    listener();

    await expect(result).resolves.toBe(true);
    expect(serviceWorker.addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
    expect(serviceWorker.removeEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "DARKCLOTH_APP_SHELL_READY" }));
  });

  it("returns false if the service worker registration throws", async () => {
    const register = vi.fn().mockRejectedValue(new Error("blocked"));

    await expect(
      registerServiceWorker({
        isProduction: true,
        isSecureContext: true,
        serviceWorker: { register },
      }),
    ).resolves.toBe(false);
  });

  it("returns false if the service worker never becomes ready", async () => {
    vi.useFakeTimers();
    try {
      const register = vi.fn().mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) });
      const result = registerServiceWorker({
        isProduction: true,
        isSecureContext: true,
        readyTimeoutMs: 25,
        serviceWorker: { ready: new Promise(() => undefined), register },
      });

      await vi.advanceTimersByTimeAsync(25);
      await expect(result).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("startServiceWorkerRegistration", () => {
  it("retries registration after an initial failure", async () => {
    vi.useFakeTimers();
    try {
      const register = vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary failure"))
        .mockResolvedValueOnce({ update: vi.fn().mockResolvedValue(undefined) });
      const addEventListener = vi.fn();
      const removeEventListener = vi.fn();

      const stop = startServiceWorkerRegistration({
        isProduction: true,
        isSecureContext: true,
        serviceWorker: { register },
        runtime: { addEventListener, removeEventListener },
        retryDelayMs: 25,
      });

      await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(25);
      await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(2));

      stop();
      expect(addEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
      expect(addEventListener).toHaveBeenCalledWith("online", expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });
});
