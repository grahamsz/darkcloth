# Phototracker API

The public API is published from the Cloudflare Worker.

- YAML: `https://darkcloth.zone/api/openapi.yaml`
- JSON: `https://darkcloth.zone/api/openapi.json`
- Health: `https://darkcloth.zone/api/health`
- Documentation: `https://darkcloth.zone/developers`

`https://phototracker.graha.ms` remains available as a legacy/staging hostname while the cutover is in progress.

The canonical contract lives in `openapi/phototracker.v1.yaml`. Published asset copies live under `public/api/openapi.yaml` and `public/api/openapi.json`; the Worker serves those files at `/api/openapi.yaml` and `/api/openapi.json`.

The `/developers` route serves an interactive documentation page powered by Redoc.

The v1 contract covers:

- Auth: register, login, current-user validation, profile edits, and password changes
- Gear: cameras, lenses, and filters
- Film: film stocks, development profiles, film holders, and rolls under `/api/film/*`
- Gear filters and filter presets
- Photographs: photograph listing, creation, detail, update, and deletion
- Images: photograph image listing, upload stub, and deletion

## Architecture Decisions

### Auth

Email/password auth with JWT Bearer tokens. No OAuth or magic links in v1 — the user base is a single person, complexity is not warranted.

- `POST /api/auth/register` — create account, returns token + user
- `POST /api/auth/login` — sign in, returns token + user
- `GET /api/auth/me` — validate token, returns user
- `PATCH /api/auth/me` — update the authenticated user's email and/or timezone; changing email requires `current_password`
- `PATCH /api/auth/password` — change the authenticated user's password with `current_password` and `new_password`

JWTs are keyed by `sub`. The `email` claim remains in the token for compatibility, but the returned `User` payload is the source of truth after any profile change.

See `docs/auth.md` for client-facing authentication details.

JWT signing key stored as a Cloudflare Worker secret (`JWT_SECRET`). Tokens are stateless — no revocation list in v1.

Password hashing: bcrypt via a WASM or pure-JS implementation compatible with the Workers runtime. Argon2 is preferred but runtime compatibility must be verified before committing.

### IDs

All primary keys are ULIDs (Universally Unique Lexicographically Sortable Identifiers). They are time-ordered, URL-safe, and stored as TEXT in D1. Generate with the `ulid` npm package or equivalent.

### Pagination

Limit/offset on all list endpoints. Default limit 50, max 200. Response envelope: `{ items: [...], total: N }`. Total is a COUNT(*) from D1. Sufficient for personal-scale datasets.

### Gear Namespacing

Cameras, lenses, and filters live under `/api/gear/*` to keep the URL tree readable.
Film resources live under `/api/film/*`: film stocks at `/api/film/stocks`, development profiles under `/api/film/stocks/{filmStockId}/development-profiles`, film holders at `/api/film/holders`, and rolls at `/api/film/rolls`.
Legacy `/api/gear/films` and `/api/gear/film_holders` routes may still exist for compatibility, but they are no longer the canonical contract.

### Images (R2)

Photograph images are stored in R2 as deterministic per-image keys under `{user_id}/{photograph_id}/{image_id}`. The display image remains the canonical `r2_key`, and optional `thumbnail_r2_key` / `original_r2_key` columns let the Worker persist the Worker-generated thumbnail and source upload.

Upload is multipart form to the Worker. The intended contract is:

- `original` as the preferred source file upload
- `display` and `file` as legacy source aliases
- `thumbnail` as a legacy compatibility field for older browser clients, though the Worker now generates and stores its own thumbnail variant
- browser-resized width/height metadata from older clients is ignored

The Worker uses the Cloudflare Images binding to derive a display variant capped at 2048px on the longest edge and a thumbnail variant capped at 256px on the longest edge, preserving aspect ratio and avoiding upscaling. The generated derivatives are JPEGs. EXIF orientation is applied by the binding; most other EXIF metadata is not preserved in the derivatives. Keep the full original upload in R2 if that metadata matters.

Responses include the signed display `url`, `thumbnail_url`, and optional `original_url`, plus the corresponding variant metadata. The stored original keeps its uploaded MIME type and dimensions.

Serving uses short-lived signed Worker URLs returned in the display `url` field. The signed URL is valid for about 1 hour and streams the private R2 object from `/api/photographs/:id/images/:image_id/file`.

Deployment note: the Worker must have both the `REFERENCE_IMAGES` R2 binding and the `IMAGES` binding. If the Images binding is unavailable, uploads return `503`. Inputs still need to be decodable by the binding; unsupported legacy formats are rejected by the API.

### Image Variant Smoke Checks

When validating a deployment, verify the following:

- `original`-only uploads create a photograph image and return display, thumbnail, and original URLs.
- Legacy `file`-only uploads still create a photograph image and return a display `url` plus a generated thumbnail.
- Multipart uploads with `display` or `file` remain compatible, even if older clients still include browser-generated metadata fields.
- Deleting a photograph image removes every stored R2 object for that record, not just the display file.

### Error Shape

All errors return `{ "error": "<message>" }` with appropriate HTTP status.

## Milestone Dependencies

```
[M0 Foundation — DONE]
  Worker + D1 schema + health endpoint deployed

[M1 API Contract — DONE]
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

## Release notes

### 2026-05-02

- Photograph image uploads now generate display and thumbnail variants in the Worker via the Cloudflare Images binding. `original` is the preferred source upload, `display`/`file` remain accepted as legacy aliases, browser-resized width/height metadata is ignored, and the generated derivatives are JPEGs with EXIF orientation applied.
- Film resources now live under `/api/film/*`. The Worker keeps the old top-level film aliases for compatibility, but the canonical contract now uses `/api/film/stocks`, `/api/film/holders`, and `/api/film/rolls`.
- Camera compatibility is now treated as a read-only summary on `Camera.acceptable_lens_ids`; the authoritative write surface is `Lens.applicable_camera_ids`. The Worker still accepts camera-side compatibility writes as a legacy alias for existing callers, but the OpenAPI request schema now points new clients at the lens-side field.
- Film stocks now expose `reciprocity_p_factor` in API responses. Create payloads default the field to `1` when omitted, and create/update requests reject non-numeric, non-finite, zero, or negative values at the API boundary.
- Film stocks now expose `stock_type` in API responses, and create/update payloads accept `color_negative`, `bw`, `color_slide`, `bw_slide`, `color_infrared`, `bw_infrared`, and `other`. Omitting `stock_type` on create keeps the legacy default of `other`; the `bw` storage value represents B&W Negative.
- BTZS / XDF development profile creation and updates are now limited to `bw` / B&W Negative film stocks at the API boundary. Existing BTZS profiles remain readable, listable, and deletable if a film stock is later reclassified.
- Photograph responses now expose structured bulb exposure fields: `shutter_mode` and `bulb_duration_seconds`. Bulb writes require a positive duration, while fixed exposures continue to use the legacy `shutter_speed_seconds` field for calculation.
- Photograph detail rows now consolidate lens/filter/film-holder metadata into a tighter layout. Fixed- and zoom-lens displays stay clear, empty filter lists are hidden, and lifecycle dates are presented directly from the compact `lifecycle_summary` timestamps.
- Rolls now expose `finished_at`, canonical `processed_at`, compatibility `developed_at`, `development_profile_id`, and `development_notes` alongside `status` and `push_pull_stops`. Create defaults `push_pull_stops` to `0`, patch continues to accept `developed_at` for older callers, and the roll lifecycle now has explicit `finish`, `process`, and `reopen` actions.
- Photograph writes now validate `roll_id` against the current user, and roll status is refreshed atomically when photographs are created, moved, or removed. When `roll_id` is present on `/api/photographs`, the list ordering follows frame number first, then capture time, then creation time, and the response already includes hydrated images and filters.
- OpenAPI artifacts were republished after the roll lifecycle contract update so the published docs match the Worker.
- Filters now expose only the active contract fields (`name`, `code`, `filter_factor`, `source`, `standard_key`, `notes`, and `applicable_lens_ids`) in API responses and create/update payloads. Legacy metadata columns (`maker`, `category`, `size`, `thread_size`, `size_system`) remain stored for older rows but are rejected at the API boundary, and photograph responses continue to include ordered `filter_ids` plus hydrated filter details.
- Auth responses now include `default_timezone`, and the Worker now supports authenticated profile updates at `PATCH /api/auth/me` plus password changes at `PATCH /api/auth/password`. Email changes require `current_password`, timezone updates accept an IANA timezone or `null`, and clients should re-read `/api/auth/me` after profile edits because JWTs stay keyed by `sub`.

### 2026-05-01

- Added nested development profile CRUD under `/api/film/stocks/{filmStockId}/development-profiles` for simple and BTZS workflows.
- BTZS chart data and source-file metadata now round-trip as JSON payloads, and effective film speed labels are preserved as text even when a numeric speed is absent.
- BTZS development profiles now accept optional `rawXdf` metadata from imported BTZS / ExpoDev `.xdf` files and preserve the exported display name, process label, scaled Paper ES value, and explicit reciprocity fields alongside the existing chart payloads.
- The API explicitly avoids BTZS calculations, push/pull recommendations, exposure recommendations, PDF import, and numeric temperature parsing. BTZS profiles can still persist imported `rawXdf` metadata when a client submits it.
- Lens aperture settings are now modeled per-lens using `min_f_stop`, `max_f_stop`, and `aperture_increment` (`full`, `half`, `third`) in the `Lens` contract.
- Web lens/gear forms accept and persist these fields, and photo forms now derive aperture choices from the selected lens bounds and increment mode.
- Added gear filters CRUD at `/api/gear/filters` and static preset list at `/api/gear/filter_presets` to support standard and custom filter factors. Filters now support `applicable_lens_ids` for lens-scoped applicability.
- OpenAPI artifacts in `public/api/openapi.yaml` and `public/api/openapi.json` were republished from `openapi/phototracker.v1.yaml` to keep public docs in sync.
- Filter preset factors and custom filter create/update payloads now use JSON numeric `filter_factor` values; legacy range presets were normalized to midpoint defaults and their provenance remains in preset notes.
- Added explicit shutter capability fields to `Camera`/`Lens` API responses and mutating payloads:
  - `has_shutter`
  - `min_shutter_speed_seconds` / `max_shutter_speed_seconds` (nullable seconds values)
  - `supports_bulb` (boolean, normalized to `false` when `has_shutter` is `false`)
- Photographs now document `shutter_speed_seconds` as the calculation-friendly shutter field and keep `shutter_speed` only as a compatibility/display string.
- Photograph writes now derive transport from the selected camera type: sheet cameras may omit `film_holder_id` and persist null when no holder is selected, while roll cameras still require `roll_id` and `frame_number`.
- The canonical film resource endpoints are now `/api/film/stocks`, `/api/film/holders`, and `/api/film/rolls`; the old top-level aliases remain available for compatibility.
```
