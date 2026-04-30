# Phototracker API

The public API is published from the Cloudflare Worker.

- YAML: `https://phototracker.graha.ms/api/openapi.yaml`
- JSON: `https://phototracker.graha.ms/api/openapi.json`
- Health: `https://phototracker.graha.ms/api/health`

The canonical contract lives in `openapi/phototracker.v1.yaml`. Published asset copies live under `public/api/openapi.yaml` and `public/api/openapi.json`; the Worker serves those files at `/api/openapi.yaml` and `/api/openapi.json`.

The v1 contract covers:

- Auth: register, login, and current-user validation
- Gear: cameras, lenses, and film stocks
- Rolls: roll listing, creation, detail, update, and deletion
- Photographs: photograph listing, creation, detail, update, and deletion
- Images: photograph image listing, upload stub, and deletion

## Architecture Decisions

### Auth

Email/password auth with JWT Bearer tokens. No OAuth or magic links in v1 — the user base is a single person, complexity is not warranted.

- `POST /api/auth/register` — create account, returns token + user
- `POST /api/auth/login` — sign in, returns token + user
- `GET /api/auth/me` — validate token, returns user

See `docs/auth.md` for client-facing authentication details.

JWT signing key stored as a Cloudflare Worker secret (`JWT_SECRET`). Tokens are stateless — no revocation list in v1.

Password hashing: bcrypt via a WASM or pure-JS implementation compatible with the Workers runtime. Argon2 is preferred but runtime compatibility must be verified before committing.

### IDs

All primary keys are ULIDs (Universally Unique Lexicographically Sortable Identifiers). They are time-ordered, URL-safe, and stored as TEXT in D1. Generate with the `ulid` npm package or equivalent.

### Pagination

Limit/offset on all list endpoints. Default limit 50, max 200. Response envelope: `{ items: [...], total: N }`. Total is a COUNT(*) from D1. Sufficient for personal-scale datasets.

### Gear Namespacing

Cameras, lenses, and film stocks live under `/api/gear/*` to keep the URL tree readable and leave `/api/` top-level for primary domain objects (rolls, photographs).

### Images (R2)

Photograph images are stored in R2 as `{user_id}/{photograph_id}/{image_id}.{ext}`. The `PhotographImage` record in D1 stores the `r2_key` and metadata. Serving: presigned R2 URLs returned in the `url` field (short-lived, ~1 hour). Upload is multipart form to the Worker, which streams to R2.

While R2 is not yet enabled on the account, `POST /api/photographs/:id/images` returns 503. The stub must be implemented so the web and Android clients can build against the interface.

### Error Shape

All errors return `{ "error": "<message>" }` with appropriate HTTP status.

## Milestone Dependencies

```
[M0 Foundation — DONE]
  Worker + D1 schema + health endpoint deployed

[M1 API Contract]
  photo-jml: Expand OpenAPI v1 YAML for all endpoints
  → Unblocks all downstream implementation

[M2 Backend]
  photo-kj7: Implement auth, D1 repos, photograph CRUD, image stubs in Worker
  → Depends on: photo-jml

[M3 R2 Images]
  photo-efz: Wire real R2 uploads after Cloudflare account has R2 enabled
  → Depends on: photo-kj7, user action (enable R2 in dashboard)

[M4 Web]
  photo-2ny: Public homepage + visual system (no auth dependency)
  photo-agx: Authenticated app shell
  → photo-agx depends on: photo-kj7 (auth endpoints), photo-2ny (visual system)

[M5 Android]
  photo-kck: Scaffold Android app against published API
  → Depends on: photo-kj7 (working auth endpoints)

[Review — runs after M2+]
  photo-hi7: Review deployment, schema, OpenAPI contract, app scaffolding
```
