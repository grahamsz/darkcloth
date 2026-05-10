import { useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/AuthContext";
import { ConnectivityProvider } from "./contexts/ConnectivityContext";
import { useConnectivity } from "./contexts/ConnectivityContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { PhotosPage } from "./pages/PhotosPage";
import { PhotoNewPage } from "./pages/PhotoNewPage";
import { PhotoDetailPage } from "./pages/PhotoDetailPage";
import { DevelopmentTimerPage } from "./pages/DevelopmentTimerPage";
import { GearPage } from "./pages/GearPage";
import { FilmStockDetailPage } from "./pages/FilmStockDetailPage";
import {
  CameraCreatePage,
  CameraEditPage,
  FilmHolderCreatePage,
  FilmHolderEditPage,
  FilmStockCreatePage,
  FilterCreatePage,
  FilterEditPage,
  LensCreatePage,
  LensEditPage,
  RollDetailPage,
  RollEditPage,
  RollCreatePage,
} from "./pages/GearResourcePages";
import { getPwaDisplayMode, refreshOfflineDataCache } from "./offline/cache";
import { syncPendingQueueForUser } from "./offline/sync";
import { startPhotographImageDisplayQueue } from "./deferredPhotographImageDisplay";

const FILM_SECTION_ROOT_PATH = "/app/film";
const FILM_STOCK_LIST_PATH = `${FILM_SECTION_ROOT_PATH}/stocks`;
const FILM_STOCK_NEW_PATH = `${FILM_STOCK_LIST_PATH}/new`;
const FILM_STOCK_DETAIL_PATH = (id: string) => `${FILM_STOCK_LIST_PATH}/${id}`;
const FILM_STOCK_EDIT_PATH = (id: string) => `${FILM_STOCK_LIST_PATH}/${id}/edit`;
const FILM_STOCK_DEVELOPMENT_PROFILE_NEW_PATH = (id: string) =>
  `${FILM_STOCK_LIST_PATH}/${id}/development-profiles/new`;
const ROLL_LIST_PATH = `${FILM_SECTION_ROOT_PATH}/rolls`;
const ROLL_NEW_PATH = `${ROLL_LIST_PATH}/new`;
const ROLL_DETAIL_PATH = (id: string) => `${ROLL_LIST_PATH}/${id}`;
const ROLL_EDIT_PATH = (id: string) => `${ROLL_LIST_PATH}/${id}/edit`;
const FILM_HOLDER_LIST_PATH = `${FILM_SECTION_ROOT_PATH}/holders`;
const FILM_HOLDER_NEW_PATH = `${FILM_HOLDER_LIST_PATH}/new`;
const FILM_HOLDER_EDIT_PATH = (id: string) => `${FILM_HOLDER_LIST_PATH}/${id}/edit`;

function RedirectToPath({ to }: { to: string }) {
  const { search } = useLocation();

  return <Navigate to={search ? `${to}${search}` : to} replace />;
}

function DocumentTitleSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    const title = (() => {
      if (pathname === "/" || pathname === "/login" || pathname === "/register" || pathname === "/forgot-password" || pathname === "/reset-password") {
        return "Darkcloth";
      }

      if (pathname.startsWith("/app/photos")) {
        return "Photographs · Darkcloth";
      }

      if (
        pathname.startsWith("/app/gear") ||
        pathname.startsWith("/app/cameras") ||
        pathname.startsWith("/app/lenses") ||
        pathname.startsWith("/app/filters") ||
        pathname.startsWith("/app/film-holders")
      ) {
        return "Gear · Darkcloth";
      }

      if (
        pathname.startsWith("/app/film") ||
        pathname.startsWith("/app/film-stocks") ||
        pathname.startsWith("/app/films")
      ) {
        return "Film · Darkcloth";
      }

      if (pathname.startsWith("/app/profile")) {
        return "Profile · Darkcloth";
      }

      if (pathname.startsWith("/app/admin")) {
        return "Admin · Darkcloth";
      }

      if (pathname.startsWith("/app/timer")) {
        return "Development Timer · Darkcloth";
      }

      return "Darkcloth";
    })();

    document.title = title;
  }, [pathname]);

  return null;
}

function GearSectionRoute() {
  const { section } = useParams();

  if (section === "cameras" || section === "lenses" || section === "filters") {
    return <GearPage section={section} />;
  }

  return <Navigate to="/app/gear/cameras" replace />;
}

function LegacyFilmDetailRoute() {
  const { id } = useParams();
  const { search } = useLocation();

  if (!id) {
    return <Navigate to={`${FILM_STOCK_LIST_PATH}${search}`} replace />;
  }

  return <Navigate to={`${FILM_STOCK_DETAIL_PATH(id)}${search}`} replace />;
}

function GearCreateRoute() {
  const { section } = useParams();

  if (section === "cameras") return <CameraCreatePage />;
  if (section === "lenses") return <LensCreatePage />;
  if (section === "filters") return <FilterCreatePage />;

  return <Navigate to="/app/gear/cameras" replace />;
}

function GearEditRoute() {
  const { section } = useParams();

  if (section === "cameras") return <CameraEditPage />;
  if (section === "lenses") return <LensEditPage />;
  if (section === "filters") return <FilterEditPage />;

  return <Navigate to="/app/gear/cameras" replace />;
}

function LegacyCameraEditRoute() {
  const { id } = useParams();

  if (!id) {
    return <Navigate to="/app/gear/cameras" replace />;
  }

  return <Navigate to={`/app/gear/cameras/${id}/edit`} replace />;
}

function LegacyLensEditRoute() {
  const { id } = useParams();

  if (!id) {
    return <Navigate to="/app/gear/lenses" replace />;
  }

  return <Navigate to={`/app/gear/lenses/${id}/edit`} replace />;
}

function LegacyFilterEditRoute() {
  const { id } = useParams();

  if (!id) {
    return <Navigate to="/app/gear/filters" replace />;
  }

  return <Navigate to={`/app/gear/filters/${id}/edit`} replace />;
}

function LegacyFilmEditRoute() {
  const { id } = useParams();
  const { search } = useLocation();

  if (!id) {
    return <Navigate to={`${FILM_STOCK_LIST_PATH}${search}`} replace />;
  }

  return <Navigate to={`${FILM_STOCK_EDIT_PATH(id)}${search}`} replace />;
}

function LegacyFilmStockDevelopmentProfileCreateRoute() {
  const { id } = useParams();
  const { search } = useLocation();

  if (!id) {
    return <Navigate to={`${FILM_STOCK_LIST_PATH}${search}`} replace />;
  }

  return <Navigate to={`${FILM_STOCK_DEVELOPMENT_PROFILE_NEW_PATH(id)}${search}`} replace />;
}

function LegacyRollRoute() {
  const { id } = useParams();
  const { search } = useLocation();

  if (!id) {
    return <Navigate to={`${ROLL_LIST_PATH}${search}`} replace />;
  }

  return <Navigate to={`${ROLL_DETAIL_PATH(id)}${search}`} replace />;
}

function LegacyRollEditRoute() {
  const { id } = useParams();
  const { search } = useLocation();

  if (!id) {
    return <Navigate to={`${ROLL_LIST_PATH}${search}`} replace />;
  }

  return <Navigate to={`${ROLL_EDIT_PATH(id)}${search}`} replace />;
}

function LegacyFilmHolderEditRoute() {
  const { id } = useParams();
  const { search } = useLocation();

  if (!id) {
    return <Navigate to={`${FILM_HOLDER_LIST_PATH}${search}`} replace />;
  }

  return <Navigate to={`${FILM_HOLDER_EDIT_PATH(id)}${search}`} replace />;
}

function LegacyPhotoEditRoute() {
  const { id } = useParams();

  if (!id) {
    return <Navigate to="/app/photos" replace />;
  }

  return <Navigate to={`/app/photos/${id}?edit=1`} replace />;
}

function PwaOfflineCacheBootstrap() {
  const { user } = useAuth();
  const { state, retrySync } = useConnectivity();
  const launchedUsersRef = useRef(new Set<string>());
  const syncingUsersRef = useRef(new Set<string>());

  const runSync = (force = false) => {
    if (!user) return;
    if (!force && state.transportStatus !== "online") return;
    if (syncingUsersRef.current.has(user.id)) return;

    syncingUsersRef.current.add(user.id);
    void syncPendingQueueForUser(user)
      .then(() => refreshOfflineDataCache(user))
      .then(() => {
        void startPhotographImageDisplayQueue();
      })
      .then(() => retrySync())
      .catch(() => null)
      .finally(() => {
        syncingUsersRef.current.delete(user.id);
      });
  };

  useEffect(() => {
    if (!user) return;
    if (getPwaDisplayMode() !== "standalone") return;
    if (launchedUsersRef.current.has(user.id)) return;

    launchedUsersRef.current.add(user.id);
    void refreshOfflineDataCache(user).catch(() => null);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (state.transportStatus !== "online") return;
    void startPhotographImageDisplayQueue();
  }, [state.transportStatus, user]);

  useEffect(() => {
    if (!user) return;
    if (state.transportStatus !== "online") return;
    if (state.pendingCount <= 0) return;

    runSync();
  }, [retrySync, state.pendingCount, state.transportStatus, user]);

  useEffect(() => {
    if (!user) return undefined;
    if (typeof window === "undefined") return undefined;

    const handleManualSync = () => {
      runSync(true);
    };

    window.addEventListener("darkcloth:sync-request", handleManualSync);
    return () => {
      window.removeEventListener("darkcloth:sync-request", handleManualSync);
    };
  }, [retrySync, state.transportStatus, user]);

  return null;
}

export function App() {
  return (
    <ConnectivityProvider>
      <AuthProvider>
        <BrowserRouter>
          <DocumentTitleSync />
          <PwaOfflineCacheBootstrap />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/app" element={<Navigate to="/app/photos" replace />} />
                <Route path="/app/profile" element={<ProfilePage />} />
                <Route path="/app/admin" element={<AdminPage />} />
                <Route path="/app/timer" element={<DevelopmentTimerPage />} />
                <Route path="/app/photos" element={<PhotosPage />} />
                <Route path="/app/photos/new" element={<PhotoNewPage />} />
                <Route path="/app/photos/:id" element={<PhotoDetailPage />} />
                <Route path="/app/photos/:id/edit" element={<LegacyPhotoEditRoute />} />
                <Route path="/app/gear" element={<Navigate to="/app/gear/cameras" replace />} />
                <Route path="/app/gear/:section" element={<GearSectionRoute />} />
                <Route path="/app/gear/:section/new" element={<GearCreateRoute />} />
                <Route path="/app/gear/:section/:id/edit" element={<GearEditRoute />} />
                <Route path="/app/cameras" element={<Navigate to="/app/gear/cameras" replace />} />
                <Route path="/app/lenses" element={<Navigate to="/app/gear/lenses" replace />} />
                <Route path="/app/filters" element={<Navigate to="/app/gear/filters" replace />} />
                <Route path="/app/cameras/new" element={<Navigate to="/app/gear/cameras/new" replace />} />
                <Route path="/app/lenses/new" element={<Navigate to="/app/gear/lenses/new" replace />} />
                <Route path="/app/filters/new" element={<Navigate to="/app/gear/filters/new" replace />} />
                <Route path="/app/cameras/:id/edit" element={<LegacyCameraEditRoute />} />
                <Route path="/app/lenses/:id/edit" element={<LegacyLensEditRoute />} />
                <Route path="/app/filters/:id/edit" element={<LegacyFilterEditRoute />} />
                <Route path="/app/film" element={<RedirectToPath to={FILM_STOCK_LIST_PATH} />} />
                <Route path={FILM_STOCK_LIST_PATH} element={<GearPage section="film_stocks" />} />
                <Route path={FILM_STOCK_NEW_PATH} element={<FilmStockCreatePage />} />
                <Route path={`${FILM_STOCK_LIST_PATH}/:id`} element={<FilmStockDetailPage />} />
                <Route path={`${FILM_STOCK_LIST_PATH}/:id/development-profiles`} element={<FilmStockDetailPage />} />
                <Route path={`${FILM_STOCK_LIST_PATH}/:id/development-profiles/new`} element={<FilmStockDetailPage />} />
                <Route path={`${FILM_STOCK_LIST_PATH}/:id/edit`} element={<FilmStockDetailPage />} />

                <Route path="/app/film-stocks" element={<RedirectToPath to={FILM_STOCK_LIST_PATH} />} />
                <Route path="/app/film-stocks/new" element={<RedirectToPath to={FILM_STOCK_NEW_PATH} />} />
                <Route path="/app/film-stocks/:id" element={<LegacyFilmDetailRoute />} />
                <Route path="/app/film-stocks/:id/development-profiles/new" element={<LegacyFilmStockDevelopmentProfileCreateRoute />} />
                <Route path="/app/film-stocks/:id/edit" element={<LegacyFilmEditRoute />} />

                <Route path="/app/films" element={<RedirectToPath to={FILM_STOCK_LIST_PATH} />} />
                <Route path="/app/films/new" element={<RedirectToPath to={FILM_STOCK_NEW_PATH} />} />
                <Route path="/app/films/:id" element={<LegacyFilmDetailRoute />} />
                <Route path="/app/films/:id/edit" element={<LegacyFilmEditRoute />} />

                <Route path={ROLL_LIST_PATH} element={<GearPage section="rolls" />} />
                <Route path={ROLL_NEW_PATH} element={<RollCreatePage />} />
                <Route path={`${ROLL_LIST_PATH}/:id`} element={<RollDetailPage />} />
                <Route path={`${ROLL_LIST_PATH}/:id/edit`} element={<RollEditPage />} />
                <Route path="/app/rolls" element={<RedirectToPath to={ROLL_LIST_PATH} />} />
                <Route path="/app/rolls/new" element={<RedirectToPath to={ROLL_NEW_PATH} />} />
                <Route path="/app/rolls/:id" element={<LegacyRollRoute />} />
                <Route path="/app/rolls/:id/edit" element={<LegacyRollEditRoute />} />

                <Route path={FILM_HOLDER_LIST_PATH} element={<GearPage section="film_holders" />} />
                <Route path={FILM_HOLDER_NEW_PATH} element={<FilmHolderCreatePage />} />
                <Route path={`${FILM_HOLDER_LIST_PATH}/:id/edit`} element={<FilmHolderEditPage />} />
                <Route path="/app/film-holders" element={<RedirectToPath to={FILM_HOLDER_LIST_PATH} />} />
                <Route path="/app/film-holders/new" element={<RedirectToPath to={FILM_HOLDER_NEW_PATH} />} />
                <Route path="/app/film-holders/:id/edit" element={<LegacyFilmHolderEditRoute />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConnectivityProvider>
  );
}
