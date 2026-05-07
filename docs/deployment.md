# Deployment

Production is intended to run as a Cloudflare Worker custom domain at:

```text
https://darkcloth.zone
```

Required Cloudflare resources:

- Worker: `phototracker`
- D1 database: `phototracker`
- R2 bucket: `phototracker-reference-images` once R2 is enabled on the account
- Custom domain route: `darkcloth.zone`
- Custom domain route: `phototracker.graha.ms` as the legacy/staging hostname during the transition

Cloudflare dashboard prerequisites:

- Attach `darkcloth.zone` to the `phototracker` Worker as a Custom Domain. Cloudflare creates the DNS records and issues the certificate for the domain automatically once the route exists.
- Keep `phototracker.graha.ms` attached only if you still want the legacy/staging hostname online during the transition.
- Create the `phototracker` D1 database and make sure the Worker keeps its `DB` binding.
- Enable R2 on the account, create the `phototracker-reference-images` bucket, and keep the Worker `REFERENCE_IMAGES` binding pointed at it.
- Enable the Images binding on the Worker and keep the `IMAGES` binding in `wrangler.toml`.
- Set `JWT_SECRET` with `wrangler secret put JWT_SECRET` or through the Worker secrets UI before deploying.

Use Wrangler from the project root:

```sh
wrangler d1 create phototracker
wrangler r2 bucket create phototracker-reference-images
wrangler d1 migrations apply phototracker
wrangler deploy
```

This deployment serves the app from `/`, the developer docs from `/developers` and `/developers/api`, and the API docs and health check from `/api/openapi.yaml`, `/api/openapi.json`, and `/api/health` on `darkcloth.zone`.

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
