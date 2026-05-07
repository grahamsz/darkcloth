# Web Source Layout

This folder is the React application code for Darkcloth.

- `api/`: typed HTTP client functions and DTOs shared by pages and hooks.
- `btzs/`: BTZS/XDF parsing, formatting, and chart-data helpers.
- `components/`: reusable UI controls that are not tied to a single route.
- `contexts/`: app-wide React providers such as auth and connectivity.
- `hooks/`: shared React hooks for loading and deriving application data.
- `offline/`: IndexedDB cache, sync queue, and PWA support.
- `pages/`: route-level screens plus small page-only glue helpers.
- `styles/`: global CSS and shared visual treatment.
- `photo*.ts`, `film*.ts`, `optics.ts`: domain helpers and pure calculations used by the UI.

Prefer keeping new domain logic out of route components. Put reusable calculations in a domain helper, reusable UI in `components/`, and route orchestration in `pages/`.
