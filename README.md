# Phototracker

Film photograph tracking application for `phototracker.graha.ms`.

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

Before image upload work ships, enable R2 on the Cloudflare account and add the `REFERENCE_IMAGES` bucket binding.
