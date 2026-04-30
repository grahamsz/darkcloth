import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

function IconFilm() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1.5" y="3" width="15" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="3.5" y="1.5" width="2" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="7.5" y="1.5" width="2" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="11.5" y="1.5" width="2" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="3.5" y="14" width="2" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="7.5" y="14" width="2" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="11.5" y="14" width="2" height="2.5" rx="0.5" fill="currentColor"/>
      <rect x="5" y="5.5" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

function IconCamera() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 6.5h1.5l1.5-2h6l1.5 2H16a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="9" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="9" cy="11" r="1" fill="currentColor"/>
    </svg>
  );
}

function IconLens() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="9" cy="9" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

function IconExposure() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M9 2v14M2 9h14" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M9 9l4.95-4.95" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function IconGPS() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 1.5C6.52 1.5 4.5 3.52 4.5 6c0 3.75 4.5 10.5 4.5 10.5S13.5 9.75 13.5 6c0-2.48-2.02-4.5-4.5-4.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="9" cy="6" r="1.5" fill="currentColor"/>
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="6" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M1.5 12l4-3.5 3 2.5 2.5-2 5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

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
            <a className="secondary" href="/downloads/phototracker.apk" download>Android app</a>
          </div>
        </div>

        <div className="log-preview" aria-label="Photograph log preview">
          <div className="preview-roll-header">
            <span className="preview-roll-label">Roll 3</span>
            <strong className="preview-film-name">Kodak Portra 400</strong>
            <span className="preview-roll-meta">ISO 400 · C-41</span>
          </div>
          <div className="preview-frame">
            <div className="preview-frame-number">12</div>
            <dl>
              <div><dt>Camera</dt><dd>Nikon FM2</dd></div>
              <div><dt>Lens</dt><dd>50mm f/1.8</dd></div>
              <div><dt>Exposure</dt><dd>1/250 · f/5.6</dd></div>
              <div><dt>GPS</dt><dd>40.7608, −111.8910</dd></div>
              <div><dt>Notes</dt><dd className="preview-notes">afternoon light, street corner</dd></div>
            </dl>
            <div className="reference-image"></div>
          </div>
        </div>
      </section>

      <section className="features" aria-label="Features">
        <div className="feature-item">
          <span className="feature-icon"><IconFilm /></span>
          <h3>Film & Rolls</h3>
          <p>Track film stocks by name, ISO, and process. Log loading and development dates per roll.</p>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><IconCamera /></span>
          <h3>Camera inventory</h3>
          <p>Catalog your cameras with make and model. Attach them to individual frames for complete records.</p>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><IconLens /></span>
          <h3>Lens library</h3>
          <p>Store focal length and maximum aperture. Know which glass made which shot.</p>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><IconExposure /></span>
          <h3>Exposure data</h3>
          <p>Record shutter speed, aperture, and compensation. Log notes per frame, not per roll.</p>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><IconGPS /></span>
          <h3>GPS coordinates</h3>
          <p>Latitude and longitude per photograph. Know exactly where on earth each frame was made.</p>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><IconImage /></span>
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
          <a href="/downloads/phototracker.apk" download>Android</a>
        </nav>
      </footer>
    </div>
  );
}
