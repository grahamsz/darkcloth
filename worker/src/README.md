# Worker Source Layout

This folder is the Cloudflare Worker API.

- `index.ts`: Worker entry point, request routing, CORS, auth wiring, and environment bindings.
- `api/`: route modules grouped by product domain.
- `types.ts`: shared Worker-side types for bindings, auth, and records.

Keep route modules focused on HTTP validation, persistence, and side effects. Shared response shapes and database-facing types belong in `types.ts` or a narrow helper module.
