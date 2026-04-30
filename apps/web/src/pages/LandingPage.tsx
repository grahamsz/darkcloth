import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";

export function LandingPage() {
  const { user, loading } = useAuth();

  if (!loading && user) return <Navigate to="/app/photos" replace />;

  return (
    <div className="landing-shell">
      <nav className="nav" aria-label="Primary">
        <a className="brand" href="/">Phototracker</a>
        <div className="nav-links">
          <Link to="/login">Sign in</Link>
          <Link className="button" to="/register">Get started</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Film photography logbook</p>
          <h1>Track every frame from camera to contact sheet.</h1>
          <p className="lede">
            Record film, lens, camera, exposure, GPS coordinates, notes, and reference images for every photograph.
          </p>
          <div className="actions">
            <Link className="primary" to="/register">Start logging</Link>
            <a className="secondary" href="/developers">API docs</a>
          </div>
        </div>

        <div className="log-preview" aria-label="Photograph log preview">
          <div className="preview-header">
            <span>Frame 12</span>
            <strong>Kodak Portra 400</strong>
          </div>
          <dl>
            <div><dt>Camera</dt><dd>Nikon FM2</dd></div>
            <div><dt>Lens</dt><dd>50mm f/1.8</dd></div>
            <div><dt>Exposure</dt><dd>1/250 at f/5.6</dd></div>
            <div><dt>GPS</dt><dd>40.7608, −111.8910</dd></div>
          </dl>
          <div className="reference-image"></div>
        </div>
      </section>
    </div>
  );
}
