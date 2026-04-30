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
