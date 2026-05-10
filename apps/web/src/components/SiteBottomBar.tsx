import { getPwaDisplayMode } from "../offline/cache";

export function SiteBottomBar() {
  if (getPwaDisplayMode() !== "browser") return null;

  return (
    <footer className="site-bottom-bar">
      <div className="site-bottom-bar-main">
        <span className="brand-wordmark" aria-label="Darkcloth">
          <span className="brand-wordmark-dark">dark</span>
          <span className="brand-wordmark-cloth">cloth</span>
        </span>
        <nav aria-label="Footer">
          <a href="/developers/api">API</a>
          <a href="https://github.com/grahamsz/darkcloth/issues" target="_blank" rel="noopener noreferrer">
            Report Issue
          </a>
          <a href="https://buymeacoffee.com/grahamsz" target="_blank" rel="noopener noreferrer">
            Support Me
          </a>
        </nav>
      </div>
      <p className="site-bottom-bar-legal">
       (C) 2026 by <a href="https://graha.ms" target="_blank" rel="noopener noreferrer">Graham Stewart</a>. AGPLv3 License.
      </p>
    </footer>
  );
}
