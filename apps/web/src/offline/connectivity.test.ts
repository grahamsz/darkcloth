import { describe, expect, it, vi } from "vitest";
import { createConnectivityController, describeConnectivity } from "./connectivity";

function createViewState(overrides = {}) {
  return {
    transportStatus: "online" as const,
    syncStatus: "synced" as const,
    pendingCount: 0,
    failedCount: 0,
    lastCheckedAt: "2026-05-02T00:00:00.000Z",
    lastError: null,
    lastCheckReason: "startup" as const,
    ...overrides,
  };
}

describe("connectivity view", () => {
  it("labels synced, offline, syncing, pending, and failed states", () => {
    expect(describeConnectivity(createViewState())).toMatchObject({
      primaryLabel: "Synced",
      secondaryLabel: "Online · 0 pending · 0 failed",
      tone: "positive",
      isRetryDisabled: false,
    });

    expect(
      describeConnectivity(
        createViewState({
          transportStatus: "offline",
          pendingCount: 3,
          failedCount: 0,
        }),
      ),
    ).toMatchObject({
      primaryLabel: "Offline",
      secondaryLabel: "Offline · 3 pending · 0 failed",
      tone: "warning",
    });

    expect(
      describeConnectivity(
        createViewState({
          syncStatus: "syncing",
        }),
      ),
    ).toMatchObject({
      primaryLabel: "Syncing",
      tone: "neutral",
      isRetryDisabled: true,
    });

    expect(
      describeConnectivity(
        createViewState({
          pendingCount: 2,
          failedCount: 0,
        }),
      ),
    ).toMatchObject({
      primaryLabel: "2 changes pending",
      tone: "warning",
    });

    expect(
      describeConnectivity(
        createViewState({
          syncStatus: "sync_failed",
          pendingCount: 1,
          failedCount: 1,
          transportStatus: "offline",
        }),
      ),
    ).toMatchObject({
      primaryLabel: "Sync failed",
      tone: "danger",
    });
  });
});

describe("connectivity controller", () => {
  it("uses the API health check even when the browser reports offline", async () => {
    const controller = createConnectivityController({
      getBrowserOnline: () => false,
      healthCheck: vi.fn().mockResolvedValue({ ok: true, service: "phototracker" }),
      readSyncQueueCounts: vi.fn().mockResolvedValue({ pendingCount: 0, failedCount: 0 }),
      now: () => "2026-05-02T00:00:00.000Z",
    });

    await controller.bootstrap();

    expect(controller.getSnapshot()).toMatchObject({
      transportStatus: "online",
      syncStatus: "synced",
      pendingCount: 0,
      failedCount: 0,
      lastCheckedAt: "2026-05-02T00:00:00.000Z",
    });
  });

  it("transitions through syncing, failed, and retry recovery states", async () => {
    const healthCheck = vi
      .fn()
      .mockRejectedValueOnce(new Error("API unreachable"))
      .mockResolvedValueOnce({ ok: true, service: "phototracker" });
    const readSyncQueueCounts = vi
      .fn()
      .mockResolvedValueOnce({ pendingCount: 2, failedCount: 1 })
      .mockResolvedValueOnce({ pendingCount: 0, failedCount: 0 });

    const controller = createConnectivityController({
      getBrowserOnline: () => true,
      healthCheck,
      readSyncQueueCounts,
      now: () => "2026-05-02T00:00:00.000Z",
    });

    const firstBootstrap = controller.bootstrap();
    expect(controller.getSnapshot().syncStatus).toBe("syncing");
    await firstBootstrap;

    expect(controller.getSnapshot()).toMatchObject({
      transportStatus: "offline",
      syncStatus: "sync_failed",
      pendingCount: 2,
      failedCount: 1,
      lastError: "API unreachable",
    });

    const retry = controller.retry();
    expect(controller.getSnapshot().syncStatus).toBe("syncing");
    await retry;

    expect(controller.getSnapshot()).toMatchObject({
      transportStatus: "online",
      syncStatus: "synced",
      pendingCount: 0,
      failedCount: 0,
      lastError: null,
    });
    expect(healthCheck).toHaveBeenCalledTimes(2);
  });

  it("automatically retries a failed health check when the browser is still online", async () => {
    vi.useFakeTimers();
    try {
      const healthCheck = vi
        .fn()
        .mockRejectedValueOnce(new Error("API temporarily unreachable"))
        .mockResolvedValueOnce({ ok: true, service: "phototracker" });
      const readSyncQueueCounts = vi.fn().mockResolvedValue({ pendingCount: 0, failedCount: 0 });

      const controller = createConnectivityController({
        getBrowserOnline: () => true,
        healthCheck,
        readSyncQueueCounts,
        now: () => "2026-05-02T00:00:00.000Z",
        transportRetryDelayMs: 25,
      });

      await controller.bootstrap();

      expect(controller.getSnapshot()).toMatchObject({
        transportStatus: "offline",
        lastError: "API temporarily unreachable",
      });

      await vi.advanceTimersByTimeAsync(25);

      expect(controller.getSnapshot()).toMatchObject({
        transportStatus: "online",
        syncStatus: "synced",
        lastError: null,
      });
      expect(healthCheck).toHaveBeenCalledTimes(2);

      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("automatically retries health checks even when the browser online flag is stale", async () => {
    vi.useFakeTimers();
    try {
      const healthCheck = vi
        .fn()
        .mockRejectedValueOnce(new Error("PWA reported offline during refresh"))
        .mockResolvedValueOnce({ ok: true, service: "phototracker" });
      const readSyncQueueCounts = vi.fn().mockResolvedValue({ pendingCount: 0, failedCount: 0 });

      const controller = createConnectivityController({
        getBrowserOnline: () => false,
        healthCheck,
        readSyncQueueCounts,
        now: () => "2026-05-02T00:00:00.000Z",
        transportRetryDelayMs: 25,
      });

      await controller.bootstrap();
      await vi.advanceTimersByTimeAsync(25);

      expect(controller.getSnapshot()).toMatchObject({
        transportStatus: "online",
        syncStatus: "synced",
        lastError: null,
      });
      expect(healthCheck).toHaveBeenCalledTimes(2);

      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
