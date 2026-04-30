import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <span className="spinner" />
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
