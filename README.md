# Darkcloth

A field notebook for film photography.

Film photograph tracking application for `darkcloth.zone`.

## License

Darkcloth is licensed under the GNU Affero General Public License v3.0 or later
(`AGPL-3.0-or-later`). See `LICENSE`.

Darkcloth is the project name and `darkcloth.zone` is the official hosted
instance. If you publish a modified hosted version, make it clear that it is an
independent fork and not the official Darkcloth service.

## Runtime

- Cloudflare Worker for API and app routing.
- Cloudflare Workers Static Assets for the public web surface.
- Cloudflare D1 for relational data.
- Cloudflare R2 for reference images once R2 is enabled on the account.

## Current endpoints

- `/` public homepage
- `/developers` API documentation entry
- `/api/health` Worker health check
- `/api/openapi.yaml` OpenAPI contract
- `/api/openapi.json` OpenAPI contract

## Deploy

```sh
wrangler deploy
```

Production custom domains:

- `darkcloth.zone` primary

Before image upload work ships, enable R2 and Images on the Cloudflare account and add the `REFERENCE_IMAGES` bucket binding plus the `IMAGES` binding.
