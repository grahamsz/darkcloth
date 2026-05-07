import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import { createConnectivityController, describeConnectivity, type ConnectivityState, type ConnectivityView } from "../offline/connectivity";
import { readSyncQueueCounts } from "../offline/schema";

interface ConnectivityContextValue {
  state: ConnectivityState;
  view: ConnectivityView;
  retrySync: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const controllerRef = useRef<ReturnType<typeof createConnectivityController> | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createConnectivityController({
      healthCheck: () => api.health(),
      readSyncQueueCounts,
      getBrowserOnline: () => (typeof navigator !== "undefined" ? navigator.onLine : true),
      now: () => new Date().toISOString(),
    });
  }

  const controller = controllerRef.current;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const view = describeConnectivity(state);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let active = true;

    void controller.bootstrap();

    const handleFocus = () => {
      if (!active) return;
      void controller.retry();
    };

    const handleOnline = () => {
      if (!active) return;
      void controller.markBrowserOnline();
    };

    const handleOffline = () => {
      if (!active) return;
      controller.markBrowserOffline();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      controller.dispose();
    };
  }, [controller]);

  return (
    <ConnectivityContext.Provider value={{ state, view, retrySync: controller.retry }}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    throw new Error("useConnectivity must be used within ConnectivityProvider");
  }
  return ctx;
}
