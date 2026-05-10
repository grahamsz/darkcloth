import { Outlet } from "react-router-dom";
import { AppNav } from "./AppNav";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
import { SiteBottomBar } from "./SiteBottomBar";
import { useConnectivity } from "../contexts/ConnectivityContext";
import { getPwaDisplayMode } from "../offline/cache";

function AppSyncBottomBar() {
  const { state, view, retrySync } = useConnectivity();
  const shouldShow = state.transportStatus === "offline"
    || state.pendingCount > 0
    || state.failedCount > 0
    || state.syncStatus === "syncing";

  if (getPwaDisplayMode() !== "standalone" || !shouldShow) {
    return null;
  }

  return (
    <div className="app-sync-bottom-bar" data-tone={view.tone} role="status" aria-live="polite" aria-atomic="true" aria-label={view.summaryLabel}>
      <span className="app-sync-bottom-bar__primary">{view.primaryLabel}</span>
      <span className="app-sync-bottom-bar__secondary">{view.secondaryLabel}</span>
      <button
        type="button"
        className="app-sync-bottom-bar__retry"
        onClick={() => {
          void retrySync().then(() => {
            window.dispatchEvent(new Event("darkcloth:sync-request"));
          });
        }}
        disabled={view.isRetryDisabled}
      >
        Retry
      </button>
    </div>
  );
}

export function AppLayout() {
  return (
    <div className="app-shell">
      <AppNav />
      <EmailVerificationBanner />
      <main className="app-main">
        <Outlet />
      </main>
      <SiteBottomBar />
      <AppSyncBottomBar />
    </div>
  );
}
