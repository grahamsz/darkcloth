# Deployment

Production is intended to run as a Cloudflare Worker custom domain at:

```text
https://phototracker.graha.ms
```

Required Cloudflare resources:

- Worker: `phototracker`
- D1 database: `phototracker`
- R2 bucket: `phototracker-reference-images` once R2 is enabled on the account
- Custom domain route: `phototracker.graha.ms`

Use Wrangler from the project root:

```sh
wrangler d1 create phototracker
wrangler r2 bucket create phototracker-reference-images
wrangler d1 migrations apply phototracker
wrangler deploy
```

R2 creation currently requires enabling R2 in the Cloudflare dashboard first.

## Secrets

JWT signing requires a Worker secret. Set it before deploying:

```sh
wrangler secret put JWT_SECRET
```

For local development, create a `.dev.vars` file (not committed) in the project root:

```ini
JWT_SECRET=dev-secret-change-in-production
```

Wrangler reads `.dev.vars` automatically during `wrangler dev`.
