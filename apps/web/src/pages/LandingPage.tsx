import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

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
            <a className="secondary" href="/api/openapi.yaml">API spec</a>
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
            <div><dt>Exposure</dt><dd>1/250 · f/5.6</dd></div>
            <div><dt>GPS</dt><dd>40.7608, −111.8910</dd></div>
          </dl>
          <div className="reference-image"></div>
        </div>
      </section>

      <section className="features" aria-label="Features">
        <div className="feature-item">
          <h3>Film & Rolls</h3>
          <p>Track film stocks by name, ISO, and process. Log loading and development dates per roll.</p>
        </div>
        <div className="feature-item">
          <h3>Camera inventory</h3>
          <p>Catalog your cameras with make and model. Attach them to individual frames for complete records.</p>
        </div>
        <div className="feature-item">
          <h3>Lens library</h3>
          <p>Store focal length and maximum aperture. Know which glass made which shot.</p>
        </div>
        <div className="feature-item">
          <h3>Exposure data</h3>
          <p>Record shutter speed, aperture, and compensation. Log notes per frame, not per roll.</p>
        </div>
        <div className="feature-item">
          <h3>GPS coordinates</h3>
          <p>Latitude and longitude per photograph. Know exactly where on earth each frame was made.</p>
        </div>
        <div className="feature-item">
          <h3>Reference images</h3>
          <p>Attach images to any frame — test prints, contact sheet scans, location photos.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Phototracker</span>
        <nav aria-label="Footer">
          <Link to="/login">Sign in</Link>
          <Link to="/register">Register</Link>
          <a href="/api/openapi.yaml">API</a>
        </nav>
      </footer>
    </div>
  );
}
