import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { PhotosPage } from "./pages/PhotosPage";
import { PhotoNewPage } from "./pages/PhotoNewPage";
import { PhotoDetailPage } from "./pages/PhotoDetailPage";
import { PhotoEditPage } from "./pages/PhotoEditPage";
import { GearPage } from "./pages/GearPage";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/app" element={<Navigate to="/app/photos" replace />} />
              <Route path="/app/photos" element={<PhotosPage />} />
              <Route path="/app/photos/new" element={<PhotoNewPage />} />
              <Route path="/app/photos/:id" element={<PhotoDetailPage />} />
              <Route path="/app/photos/:id/edit" element={<PhotoEditPage />} />
              <Route path="/app/cameras" element={<GearPage section="cameras" />} />
              <Route path="/app/lenses" element={<GearPage section="lenses" />} />
              <Route path="/app/films" element={<GearPage section="films" />} />
              <Route path="/app/rolls" element={<GearPage section="rolls" />} />
              <Route path="/app/film-holders" element={<GearPage section="film_holders" />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
