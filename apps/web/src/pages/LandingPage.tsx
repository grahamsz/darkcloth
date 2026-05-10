import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SiteBottomBar } from "../components/SiteBottomBar";

const BTZS_PROFILE_SERVICE_URL = "https://viewcamerastore.com/collections/btzs-products/products/btzs-film-test-roll";
const BTZS_COMMUNITY_URL = "https://btzs.org/";

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

function LandingComparisonSlider() {
  const [split, setSplit] = useState(52);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const updateSplitFromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(95, Math.max(5, next)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateSplitFromPointer(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) updateSplitFromPointer(event.clientX);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplit(current => Math.max(5, current - 2));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplit(current => Math.min(95, current + 2));
    }
  };

  return (
    <div
      ref={containerRef}
      className={[
        "filter-simulation-comparison",
        "landing-filter-comparison",
        dragging ? "filter-simulation-comparison--dragging" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--filter-simulation-split": `${split}%` } as CSSProperties}
      role="slider"
      tabIndex={0}
      aria-label="Reference image filter comparison"
      aria-valuemin={5}
      aria-valuemax={95}
      aria-valuenow={Math.round(split)}
      aria-valuetext={`${Math.round(split)} percent filtered comparison`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={handleKeyDown}
    >
      <img
        className="filter-simulation-comparison-canvas landing-filter-comparison-image"
        src="/landing-sample-no-filter.jpg"
        alt="Reference image without a filter preview"
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      />
      <img
        className="filter-simulation-comparison-canvas filter-simulation-comparison-canvas--filtered landing-filter-comparison-image"
        src="/landing-sample-filter.jpg"
        alt="Reference image with a filter preview"
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      />
      <div className="filter-simulation-comparison-label filter-simulation-comparison-label--left">No filter</div>
      <div className="filter-simulation-comparison-label filter-simulation-comparison-label--right">Red filter</div>
      <div className="filter-simulation-comparison-divider" aria-hidden="true" />
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing-shell">
      <nav className="nav" aria-label="Primary">
        <a className="brand" href="/" aria-label="Darkcloth">
          <span className="brand-wordmark" aria-hidden="true">
            <span className="brand-wordmark-dark">dark</span>
            <span className="brand-wordmark-cloth">cloth</span>
          </span>
        </a>
        <div className="nav-links">
          {user ? (
            <Link className="button button-accent" to="/app/photos">Go to App &gt;</Link>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link className="button" to="/register">Get started</Link>
            </>
          )}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="landing-logotype">
            <span className="brand-wordmark" aria-label="darkcloth">
              <span className="brand-wordmark-dark">dark</span>
              <span className="brand-wordmark-cloth">cloth</span>
            </span>
          </p>
          <h1>A field notebook for large format photographers.</h1>
          <p className="lede">
            Record holders, film, lens, camera, exposure, location, notes, reference images, and development details
            while you are still in the field.
          </p>
          <div className="actions">
            {user ? (
              <Link className="primary" to="/app/photos">Go to App &gt;</Link>
            ) : (
              <Link className="primary" to="/register">Start logging</Link>
            )}
          </div>
        </div>

        <figure className="landing-product-shot landing-product-shot--hero">
          <img src="/landing-photo-log.webp" alt="Darkcloth photo log running on a phone" />
        </figure>
      </section>

      <section className="landing-proof-grid" aria-label="Key Darkcloth features">
        <div><strong>Free</strong><span>I built this for myself. If it gets thousands of users and costs real money to run I might have to reconsider, but it's also open source.</span></div>
        <div><strong>Open Source</strong><span>AGPL licensed so you can run your own instance.</span></div>
        <div><strong>Open API</strong><span>Documented API for your own workflows.</span></div>
        <div><strong>Works Offline</strong><span>Install as a Progressive Web App and continue logging without an internet connection.</span></div>
      </section>

      <section className="landing-section landing-data-section" aria-labelledby="landing-data-title">
        <div className="landing-section-copy">
          <p className="section-kicker">Complete field notes</p>
          <h2 id="landing-data-title">Capture all the data that matters before it gets lost.</h2>
          <p>
            darkcloth lets you use your cellphone camera to capture a reference image, then log all the details of your shot alongside it. Never forget a film type, exposure, or location again. If you use <a href="https://btzs.org/" target="_blank" rel="noopener noreferrer">Beyond the Zone System</a> profiles and spot-metering then darkcloth will calculate the exposure and development times for you.
          </p>
        </div>
        <figure className="landing-product-shot landing-product-shot--detail">
          <img src="/landing-photo-detail.webp" alt="Darkcloth photograph detail view with camera, lens, film, exposure, date, and location" />
        </figure>
      </section>

      <section className="landing-section landing-reference-section" aria-labelledby="landing-reference-title">
        <div className="landing-section-copy">
          <p className="section-kicker">Reference image preview</p>
          <h2 id="landing-reference-title">Use a cellphone reference image to preview filter decisions.</h2>
          <p>
            Attach a quick phone image to the log and preview a black-and-white filter response before you set up the
            camera. Drag the divider to compare the straight reference with the filtered preview.
          </p>
        </div>
        <div className="landing-reference-demo">
          <LandingComparisonSlider />
        </div>
      </section>

      <section className="landing-section landing-exposure-section" aria-labelledby="landing-exposure-title">
        <div className="landing-section-copy">
          <p className="section-kicker">Exposure methods</p>
          <h2 id="landing-exposure-title">Meter the way you actually work.</h2>
          <p>
            Enter the exposure yourself, estimate from the cell phone reference, or use BTZS profiles to calculate from your spot-meter placements.
          </p>
          <div className="landing-link-list">
            <a href={BTZS_PROFILE_SERVICE_URL} target="_blank" rel="noopener noreferrer">Get BTZS profiles made</a>
            <a href={BTZS_COMMUNITY_URL} target="_blank" rel="noopener noreferrer">Beyond the Zone System community</a>
          </div>
        </div>
        <div className="landing-metering-stack">
          <figure className="landing-btzs-screenshot">
            <img src="/landing-btzs-profile.webp" alt="BTZS development profile charts in darkcloth" />
          </figure>
          <div className="landing-method-grid">
            <div>
              <strong>Cellphone reference image</strong>
              <p>Use a location photo as a visual memory aid and filter-preview source for the logged sheet.</p>
            </div>
            <div>
              <strong>Spot metering</strong>
              <p>Record shadow and highlight placements, zone range, target EV, and the resulting exposure.</p>
            </div>
            <div>
              <strong>BTZS profiles</strong>
              <p>Calculate from BTZS film profiles, including development targets and effective film speed.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-timer-section" aria-labelledby="landing-timer-title">
        <div className="landing-section-copy">
          <p className="section-kicker">Darkroom timer</p>
          <h2 id="landing-timer-title">Keep multiple sheets moving through development.</h2>
          <p>
            Processing multiple sheets at once and taking them out at the right time used to be pain, but darkcloth's timer lets you track multiple sheets at once.
          </p>
        </div>
        <figure className="landing-product-shot landing-product-shot--timer">
          <img src="/landing-darkroom-timer.webp" alt="Darkcloth multi-sheet darkroom development timer" />
        </figure>
      </section>

      <SiteBottomBar />
    </div>
  );
}
