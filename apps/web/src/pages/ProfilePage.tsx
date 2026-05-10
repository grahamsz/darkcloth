import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useConnectivity } from "../contexts/ConnectivityContext";
import {
  readOfflineRuntimeReadiness,
  refreshOfflineDataCache,
  type OfflineRuntimeReadiness,
} from "../offline/cache";
import { readSyncQueueEntries, type ReferenceImageProcessingJobRecord, type SyncQueueEntry } from "../offline/schema";
import {
  readPhotographImageProcessingJobs,
  startPhotographImageDisplayQueue,
  subscribePhotographImageProcessingJobs,
} from "../deferredPhotographImageDisplay";
import { registerServiceWorker } from "../pwa";
import { getBrowserTimeZone, getTimezoneOptions, isValidTimeZone } from "../timezones";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SectionMessage({ error, success }: { error: string | null; success: string | null }) {
  if (error) return <p className="form-error">{error}</p>;
  if (success) return <p className="form-success">{success}</p>;
  return null;
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatYesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function formatSyncQueueEntryTitle(entry: SyncQueueEntry) {
  const entityLabel = entry.entityType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const operationLabel = entry.operation.charAt(0).toUpperCase() + entry.operation.slice(1);
  const statusLabel = entry.status === "syncing" ? "Syncing" : entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
  return `${statusLabel} · ${operationLabel} ${entityLabel}`;
}

function formatImageProcessingJobTitle(job: ReferenceImageProcessingJobRecord) {
  const statusLabel = job.status === "done"
    ? "Done"
    : job.status.charAt(0).toUpperCase() + job.status.slice(1);
  return `${statusLabel} · ${job.originalName}`;
}

function formatJobImageId(job: ReferenceImageProcessingJobRecord) {
  return `Photo ${job.photoId.slice(0, 8)} · Image ${job.imageId.slice(0, 8)}`;
}

export function ProfilePage() {
  const { user, replaceUser, logout } = useAuth();
  const { view: connectivityView } = useConnectivity();
  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const timezoneOptions = useMemo(() => getTimezoneOptions(browserTimeZone), [browserTimeZone]);

  const [emailDraft, setEmailDraft] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [timezoneDraft, setTimezoneDraft] = useState(browserTimeZone);

  const [autoLocationDraft, setAutoLocationDraft] = useState(false);

  const [offlineReadiness, setOfflineReadiness] = useState<OfflineRuntimeReadiness | null>(null);
  const [syncQueueEntries, setSyncQueueEntries] = useState<SyncQueueEntry[]>([]);
  const [imageProcessingJobs, setImageProcessingJobs] = useState<ReferenceImageProcessingJobRecord[]>([]);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [offlineRefreshing, setOfflineRefreshing] = useState(false);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineSuccess, setOfflineSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadOfflineReadiness = useCallback(async () => {
    setOfflineLoading(true);
    try {
      const readiness = await readOfflineRuntimeReadiness(user);
      const queueEntries = await readSyncQueueEntries(30);
      const processingJobs = await readPhotographImageProcessingJobs(30);
      setOfflineReadiness(readiness);
      setSyncQueueEntries(user ? queueEntries.filter((entry) => entry.userId === user.id) : []);
      setImageProcessingJobs(processingJobs);
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : "Failed to read offline readiness.");
    } finally {
      setOfflineLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setEmailDraft(user.email);
    setEmailPassword("");
    setPasswordCurrent("");
    setPasswordNew("");
    setPasswordConfirm("");
    setTimezoneDraft(user.default_timezone ?? browserTimeZone);
    setAutoLocationDraft(user.auto_use_current_location);
  }, [browserTimeZone, user]);

  useEffect(() => {
    if (!user) {
      setOfflineReadiness(null);
      setImageProcessingJobs([]);
      return;
    }

    void loadOfflineReadiness();
  }, [loadOfflineReadiness, user]);

  useEffect(() => {
    if (!user) return undefined;
    const handleJobsChanged = () => {
      void readPhotographImageProcessingJobs(30).then(setImageProcessingJobs);
    };
    const unsubscribe = subscribePhotographImageProcessingJobs(handleJobsChanged);
    const interval = window.setInterval(handleJobsChanged, 2500);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [user]);

  if (!user) {
    return (
      <div className="page page-wide profile-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const clearPasswordStatus = () => {
    setPasswordError(null);
    setPasswordSuccess(null);
  };

  const clearSettingsStatus = () => {
    setSettingsError(null);
    setSettingsSuccess(null);
  };

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmailDraft(event.target.value);
    clearSettingsStatus();
  };

  const handleEmailPasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmailPassword(event.target.value);
    clearSettingsStatus();
  };

  const handlePasswordCurrentChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPasswordCurrent(event.target.value);
    clearPasswordStatus();
  };

  const handlePasswordNewChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPasswordNew(event.target.value);
    clearPasswordStatus();
  };

  const handlePasswordConfirmChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPasswordConfirm(event.target.value);
    clearPasswordStatus();
  };

  const handleTimezoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTimezoneDraft(event.target.value);
    clearSettingsStatus();
  };

  const handleAutoLocationChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAutoLocationDraft(event.target.checked);
    clearSettingsStatus();
  };

  const handleSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearSettingsStatus();

    const normalizedEmail = emailDraft.trim().toLowerCase();
    const normalizedTimezone = timezoneDraft.trim();
    const emailChanged = normalizedEmail !== user.email.toLowerCase();

    if (!EMAIL_RE.test(normalizedEmail)) {
      setSettingsError("Enter a valid email address.");
      return;
    }
    if (emailChanged && !emailPassword.trim()) {
      setSettingsError("Current password is required to change email.");
      return;
    }
    if (normalizedTimezone && !isValidTimeZone(normalizedTimezone)) {
      setSettingsError("Enter a valid IANA timezone, or leave it blank to use the browser timezone.");
      return;
    }

    setSettingsSaving(true);
    try {
      const updated = await api.updateMe({
        email: normalizedEmail === user.email.toLowerCase() ? undefined : normalizedEmail,
        current_password: emailChanged ? emailPassword : undefined,
        default_timezone: normalizedTimezone || null,
        auto_use_current_location: autoLocationDraft,
      });
      replaceUser(updated);
      setEmailPassword("");
      setSettingsSuccess("Profile settings saved.");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save profile settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearPasswordStatus();

    if (!passwordCurrent.trim()) {
      setPasswordError("Current password is required.");
      return;
    }
    if (passwordNew.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const updated = await api.updatePassword({
        current_password: passwordCurrent,
        new_password: passwordNew,
      });
      replaceUser(updated);
      setPasswordCurrent("");
      setPasswordNew("");
      setPasswordConfirm("");
      setPasswordSuccess("Password updated.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleOfflineCacheRefresh = async () => {
    if (!user) return;
    setOfflineRefreshing(true);
    setOfflineError(null);
    setOfflineSuccess(null);

    try {
      await refreshOfflineDataCache(user);
      await loadOfflineReadiness();
      setOfflineSuccess("Offline film and profile cache updated.");
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : "Failed to update offline cache.");
    } finally {
      setOfflineRefreshing(false);
    }
  };

  const handleServiceWorkerRetry = async () => {
    setOfflineLoading(true);
    setOfflineError(null);
    setOfflineSuccess(null);

    try {
      const registered = await registerServiceWorker({ readyTimeoutMs: 1500 });
      await loadOfflineReadiness();
      setOfflineSuccess(registered
        ? "Service worker registered. If Page controlled is still No, reopen the app once."
        : "Service worker registration did not become ready. Check the registration result below.");
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : "Failed to retry service worker registration.");
    } finally {
      setOfflineLoading(false);
    }
  };

  const handleProcessImagesNow = async () => {
    setOfflineLoading(true);
    setOfflineError(null);
    setOfflineSuccess(null);
    try {
      await startPhotographImageDisplayQueue();
      await loadOfflineReadiness();
      setOfflineSuccess("Image processing queue checked.");
    } catch (err) {
      setOfflineError(err instanceof Error ? err.message : "Failed to process image queue.");
    } finally {
      setOfflineLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    window.location.replace("/");
  };

  const handleExportWorkbook = async () => {
    setExporting(true);
    setExportError(null);

    try {
      const blob = await api.exportDataWorkbook();
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const link = document.createElement("a");
      link.href = url;
      link.download = `darkcloth-export-${today}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Failed to export workbook.");
    } finally {
      setExporting(false);
    }
  };

  const savedTimeZone = user.default_timezone;
  const cacheStats = offlineReadiness?.cacheStats;
  const serviceWorkerDiagnostics = offlineReadiness?.serviceWorkerRegistrationDiagnostics;
  const pendingQueueCount = syncQueueEntries.filter((entry) => entry.status === "pending" || entry.status === "syncing").length;
  const failedQueueCount = syncQueueEntries.filter((entry) => entry.status === "failed").length;
  const visibleImageProcessingJobs = imageProcessingJobs.filter((job) => job.status === "pending" || job.status === "processing" || job.status === "failed");
  const activeImageProcessingCount = visibleImageProcessingJobs.filter((job) => job.status === "pending" || job.status === "processing").length;
  const failedImageProcessingCount = visibleImageProcessingJobs.filter((job) => job.status === "failed").length;
  const showImageProcessingStatus = visibleImageProcessingJobs.length > 0;

  return (
    <div className="page page-wide profile-page">
      <div className="page-header">
        <div>
          <p className="page-count">Account</p>
          <h1>Profile</h1>
        </div>
      </div>

      <section className="profile-section profile-section--wide">
        <div className="profile-section-header">
          <div>
            <p className="page-count">Settings</p>
            <h2>Account defaults</h2>
          </div>
          <div className="profile-summary-actions">
            <button className="btn-secondary" type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSettingsSubmit} noValidate>
          <SectionMessage error={settingsError} success={settingsSuccess} />

          <div className="profile-settings-grid">
            <div className="field">
              <label htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                type="email"
                value={emailDraft}
                onChange={handleEmailChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="profile-email-password">Current password</label>
              <input
                id="profile-email-password"
                type="password"
                value={emailPassword}
                onChange={handleEmailPasswordChange}
                autoComplete="current-password"
                placeholder="Only needed to change email"
              />
            </div>

            <div className="field">
              <label htmlFor="profile-timezone">Default timezone</label>
              <input
                id="profile-timezone"
                value={timezoneDraft}
                onChange={handleTimezoneChange}
                list="profile-timezone-options"
                placeholder={browserTimeZone}
              />
              <datalist id="profile-timezone-options">
                {timezoneOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <p className="field-note">Leave blank to use the browser timezone. Current: {savedTimeZone || `browser (${browserTimeZone})`}.</p>
            </div>

            <label className="checkbox-row profile-checkbox-row profile-settings-checkbox" htmlFor="profile-auto-location">
              <input
                id="profile-auto-location"
                type="checkbox"
                checked={autoLocationDraft}
                onChange={handleAutoLocationChange}
              />
              <span>Automatically use current location on new photos</span>
            </label>
          </div>

          <div className="form-actions profile-form-actions">
            <button className="btn-primary" type="submit" disabled={settingsSaving}>
              {settingsSaving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </section>

      <section className="profile-section profile-section--wide">
        <div className="profile-section-header">
          <div>
            <p className="page-count">Export</p>
            <h2>Data workbook</h2>
          </div>
          <p className="profile-section-intro muted">
            Download your cameras, lenses, filters, film, rolls, holders, photographs, development profiles, and relationship tables.
          </p>
        </div>
        {exportError && <p className="form-error">{exportError}</p>}
        <div className="profile-form-actions">
          <button className="btn-primary" type="button" onClick={handleExportWorkbook} disabled={exporting}>
            {exporting ? "Exporting…" : "Export Excel workbook"}
          </button>
        </div>
      </section>

      <div className="profile-sections">
        <section className="profile-section">
          <div className="profile-section-header">
            <div>
              <p className="page-count">Password</p>
              <h2>Change password</h2>
            </div>
            <p className="profile-section-intro muted">
              Use a new password that is at least 8 characters long.
            </p>
          </div>

          <form className="profile-form" onSubmit={handlePasswordSubmit} noValidate>
            <SectionMessage error={passwordError} success={passwordSuccess} />

            <div className="field">
              <label htmlFor="profile-current-password">Current password</label>
              <input
                id="profile-current-password"
                type="password"
                value={passwordCurrent}
                onChange={handlePasswordCurrentChange}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="profile-new-password">New password</label>
              <input
                id="profile-new-password"
                type="password"
                value={passwordNew}
                onChange={handlePasswordNewChange}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="profile-confirm-password">Confirm new password</label>
              <input
                id="profile-confirm-password"
                type="password"
                value={passwordConfirm}
                onChange={handlePasswordConfirmChange}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="form-actions profile-form-actions">
              <button className="btn-primary" type="submit" disabled={passwordSaving}>
                {passwordSaving ? "Saving…" : "Save password"}
              </button>
            </div>
          </form>
        </section>

        <section className="profile-section profile-section--wide profile-offline-section">
          <details className="profile-offline-details">
            <summary className="profile-offline-summary">
              <div>
                <p className="page-count">Offline</p>
                <h2>Offline readiness</h2>
              </div>
              <span className="profile-offline-summary-status">
                {connectivityView.primaryLabel} · {pendingQueueCount} pending
              </span>
            </summary>

            <div className="profile-offline-details-body">
              <p className="profile-section-intro muted">
                Cached data, pending uploads, and service worker diagnostics for offline use.
              </p>

              <SectionMessage error={offlineError} success={offlineSuccess} />

              <div className="profile-summary-grid profile-offline-grid">
            <div className="profile-summary-item">
              <span>Connection</span>
              <strong>{connectivityView.primaryLabel}</strong>
              <small className="muted">{connectivityView.secondaryLabel}</small>
            </div>
            <div className="profile-summary-item">
              <span>Pending uploads</span>
              <strong>{pendingQueueCount}</strong>
              <small className="muted">{failedQueueCount > 0 ? `${failedQueueCount} failed item${failedQueueCount === 1 ? "" : "s"}` : "No failed sync items."}</small>
            </div>
            {showImageProcessingStatus && (
              <div className="profile-summary-item">
                <span>Image processing</span>
                <strong>{activeImageProcessingCount}</strong>
                <small className="muted">
                  {failedImageProcessingCount > 0
                    ? `${failedImageProcessingCount} failed reference image${failedImageProcessingCount === 1 ? "" : "s"}`
                    : "Preparing reference image displays."}
                </small>
              </div>
            )}
            <div className="profile-summary-item">
              <span>Offline storage</span>
              <strong>{offlineReadiness ? formatYesNo(offlineReadiness.indexedDbSupported) : "Checking…"}</strong>
              <small className="muted">Local cache for gear, film, photos, and queued writes.</small>
            </div>
            <div className="profile-summary-item">
              <span>Service worker</span>
              <strong>{offlineReadiness ? formatYesNo(offlineReadiness.serviceWorkerSupported) : "Checking…"}</strong>
              <small className="muted">Browser support for offline route handling.</small>
            </div>
            <div className="profile-summary-item">
              <span>Worker ready</span>
              <strong>{offlineReadiness ? formatYesNo(offlineReadiness.serviceWorkerReady) : "Checking…"}</strong>
              <small className="muted">The worker has installed and activated.</small>
            </div>
            <div className="profile-summary-item">
              <span>Page controlled</span>
              <strong>{offlineReadiness ? formatYesNo(offlineReadiness.serviceWorkerControlled) : "Checking…"}</strong>
              <small className="muted">This page is currently routed through the worker.</small>
            </div>
            <div className="profile-summary-item">
              <span>Worker state</span>
              <strong>{offlineReadiness?.serviceWorkerRegistrationState ?? "Checking…"}</strong>
              <small className="muted">Chrome registration state reported by this device.</small>
            </div>
            <div className="profile-summary-item">
              <span>Registration result</span>
              <strong>{serviceWorkerDiagnostics?.lastResult ?? "Checking…"}</strong>
              <small className="muted">
                {serviceWorkerDiagnostics
                  ? `Attempts ${serviceWorkerDiagnostics.attemptCount} · secure ${formatYesNo(Boolean(serviceWorkerDiagnostics.isSecureContext))} · prod ${formatYesNo(Boolean(serviceWorkerDiagnostics.isProduction))}`
                  : "Waiting for registration diagnostics."}
              </small>
            </div>
            <div className="profile-summary-item profile-offline-grid-wide">
              <span>Registration error</span>
              <strong>{serviceWorkerDiagnostics?.lastErrorName ?? "None"}</strong>
              <small className="muted">{serviceWorkerDiagnostics?.lastErrorMessage ?? "No registration error reported by this browser."}</small>
            </div>
            <div className="profile-summary-item">
              <span>Cached records</span>
              <strong>{cacheStats ? cacheStats.cameraCount + cacheStats.lensCount + cacheStats.filterCount + cacheStats.filmStockCount + cacheStats.rollCount + cacheStats.filmHolderCount + cacheStats.photographCount : "—"}</strong>
              <small className="muted">
                {cacheStats
                  ? `${cacheStats.photographCount} photos · ${cacheStats.filmStockCount} film stocks · ${cacheStats.developmentProfileCount} profiles`
                  : "Waiting for cache stats."}
              </small>
            </div>
            <div className="profile-summary-item profile-offline-grid-wide">
              <span>Last cache update</span>
              <strong>{cacheStats ? formatDateTime(cacheStats.lastRefreshedAt) : "—"}</strong>
              <small className="muted">Use the button below after adding gear or film on another device.</small>
            </div>
              </div>

              <div className="sync-queue-panel">
            <h3>Sync queue</h3>
            {syncQueueEntries.length === 0 ? (
              <p className="muted">No pending uploads or offline changes.</p>
            ) : (
              <ul className="sync-queue-list">
                {syncQueueEntries.map((entry) => (
                  <li key={entry.id} className={`sync-queue-item sync-queue-item--${entry.status}`}>
                    <div>
                      <strong>{formatSyncQueueEntryTitle(entry)}</strong>
                      <span>{formatDateTime(entry.createdAt)}</span>
                    </div>
                    {entry.lastError && <p className="form-error">{entry.lastError}</p>}
                  </li>
                ))}
              </ul>
            )}
              </div>

              {showImageProcessingStatus && (
                <div className="sync-queue-panel image-processing-queue-panel">
              <h3>Image processing</h3>
              <ul className="sync-queue-list">
                {visibleImageProcessingJobs.map((job) => (
                  <li key={job.id} className={`sync-queue-item sync-queue-item--${job.status}`}>
                    <div>
                      <strong>{formatImageProcessingJobTitle(job)}</strong>
                      <span>{formatDateTime(job.updatedAt)}</span>
                    </div>
                    <span className="muted">{formatJobImageId(job)} · Attempt {job.attempts}</span>
                    {job.lastError && <p className="form-error">{job.lastError}</p>}
                  </li>
                ))}
              </ul>
                </div>
              )}

              <div className="profile-form-actions">
            <button
              className="btn-primary"
              type="button"
              onClick={handleOfflineCacheRefresh}
              disabled={offlineRefreshing || offlineLoading}
            >
              {offlineRefreshing ? "Updating…" : "Update offline cache"}
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => void loadOfflineReadiness()}
              disabled={offlineRefreshing || offlineLoading}
            >
              {offlineLoading ? "Checking…" : "Recheck status"}
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => void handleServiceWorkerRetry()}
              disabled={offlineRefreshing || offlineLoading}
            >
              Retry service worker
            </button>
            {showImageProcessingStatus && (
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void handleProcessImagesNow()}
                disabled={offlineRefreshing || offlineLoading}
              >
                Retry image processing
              </button>
            )}
              </div>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
