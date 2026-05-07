# Phototracker API Authentication

Phototracker v1 uses email/password authentication with JWT bearer tokens.

## Endpoints

- `POST /api/auth/register` creates an account and returns `{ token, user }`.
- `POST /api/auth/login` signs in and returns `{ token, user }`.
- `GET /api/auth/me` validates the current bearer token and returns the authenticated user.
- `PATCH /api/auth/me` updates the authenticated user's `email` and/or `default_timezone`. Changing `email` requires `current_password`.
- `PATCH /api/auth/password` changes the authenticated user's password and requires `current_password` plus `new_password`.

## Token Usage

Authenticated requests send the token in the `Authorization` header:

```http
Authorization: Bearer <token>
```

The OpenAPI contract declares this as `bearerAuth` and applies it globally. Public endpoints override security where needed, including `/api/health`, `/api/auth/register`, and `/api/auth/login`.

JWTs are still keyed by `sub`. The `email` claim is informational and can lag after a profile update, so clients should treat the returned `user` object from `/api/auth/me` as the source of truth after editing profile fields.

These bearer tokens are host-agnostic; the same token works against both `darkcloth.zone` and `phototracker.graha.ms` while the legacy host remains online.

## Error Shape

Authentication failures use the standard API error shape:

```json
{ "error": "Not authenticated" }
```

Clients should treat HTTP `401` as an expired, missing, or invalid token and require the user to sign in again.

Profile and password updates use the same error envelope for validation issues, current-password failures, duplicate emails, and invalid timezones. Typical responses include `current_password is required when updating email`, `Invalid current password`, `Email already registered`, and `default_timezone must be a valid IANA timezone or null`.
