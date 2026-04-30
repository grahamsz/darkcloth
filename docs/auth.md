# Phototracker API Authentication

Phototracker v1 uses email/password authentication with JWT bearer tokens.

## Endpoints

- `POST /api/auth/register` creates an account and returns `{ token, user }`.
- `POST /api/auth/login` signs in and returns `{ token, user }`.
- `GET /api/auth/me` validates the current bearer token and returns the authenticated user.

## Token Usage

Authenticated requests send the token in the `Authorization` header:

```http
Authorization: Bearer <token>
```

The OpenAPI contract declares this as `bearerAuth` and applies it globally. Public endpoints override security where needed, including `/api/health`, `/api/auth/register`, and `/api/auth/login`.

## Error Shape

Authentication failures use the standard API error shape:

```json
{ "error": "Not authenticated" }
```

Clients should treat HTTP `401` as an expired, missing, or invalid token and require the user to sign in again.
