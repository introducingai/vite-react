# Security Production Notes

## Required environment variables

Set these in local `.env` and in the production platform:

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
XAI_API_KEY=
AUTH_SESSION_SECRET=
AUTH_SESSION_DURATION_SECONDS=43200
OPERATOR_ACCOUNTS_JSON=
OPERATOR_NAME=
OPERATOR_EMAIL=
OPERATOR_PASSWORD=
OPERATOR_PASSWORD_HASH=
OPERATOR_ROLE=admin
MODERATION_API_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ALLOWED_ORIGINS=https://introducing.life,https://www.introducing.life
ANALYZE_RATE_LIMIT_WINDOW_MS=60000
ANALYZE_RATE_LIMIT_MAX_REQUESTS=10
MARKET_SCAN_RATE_LIMIT_WINDOW_MS=60000
MARKET_SCAN_RATE_LIMIT_MAX_REQUESTS=6
MONITOR_RATE_LIMIT_WINDOW_MS=60000
MONITOR_RATE_LIMIT_MAX_REQUESTS=4
SUBMISSIONS_PUBLIC_RATE_LIMIT_WINDOW_MS=60000
SUBMISSIONS_PUBLIC_RATE_LIMIT_MAX_REQUESTS=6
MODERATION_RATE_LIMIT_WINDOW_MS=60000
MODERATION_RATE_LIMIT_MAX_REQUESTS=30
ENTRIES_READ_RATE_LIMIT_WINDOW_MS=60000
ENTRIES_READ_RATE_LIMIT_MAX_REQUESTS=30
ENTRIES_WRITE_RATE_LIMIT_WINDOW_MS=60000
ENTRIES_WRITE_RATE_LIMIT_MAX_REQUESTS=12
AUTH_LOGIN_RATE_LIMIT_WINDOW_MS=60000
AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS=8
AUTH_SESSION_RATE_LIMIT_WINDOW_MS=60000
AUTH_SESSION_RATE_LIMIT_MAX_REQUESTS=30
AUTH_LOGOUT_RATE_LIMIT_WINDOW_MS=60000
AUTH_LOGOUT_RATE_LIMIT_MAX_REQUESTS=20
AUDIT_LOGS_RATE_LIMIT_WINDOW_MS=60000
AUDIT_LOGS_RATE_LIMIT_MAX_REQUESTS=20
```

## Access model

- `GET /api/entries`: public
- `POST /api/entries`: operator auth required
- `POST /api/submissions`: public
- `GET /api/submissions`: operator auth required
- `PATCH /api/submissions`: operator auth required

Protected routes now accept either:

- an operator session cookie issued by `/api/auth/login`
- or the manual fallback moderation token

The browser UI now has:

- an `Operator auth` panel for password session login
- a `Moderation API token` field in the provider panel as fallback

The fallback token remains useful for emergency access and transition, but the preferred path is session auth.

## Operator auth setup

Preferred production setup:

- `AUTH_SESSION_SECRET`: long random secret, at least 32 bytes
- `OPERATOR_ACCOUNTS_JSON` for one or more operator accounts with roles
- or the single-account fallback: `OPERATOR_EMAIL`, `OPERATOR_PASSWORD_HASH`, and `OPERATOR_ROLE`

`OPERATOR_PASSWORD_HASH` is the lowercase hex SHA-256 of the operator password. `OPERATOR_PASSWORD` is still supported, but only as a simpler fallback.

Example multi-operator configuration:

```json
[
  {
    "email": "moderator@introducing.life",
    "password_hash": "sha256_hex_here",
    "role": "moderator",
    "name": "Moderation Desk"
  },
  {
    "email": "editor@introducing.life",
    "password_hash": "sha256_hex_here",
    "role": "editor",
    "name": "Editorial Desk"
  }
]
```

Role model currently supported:

- `viewer`
- `moderator`
- `editor`
- `admin`

Current route policy:

- `GET /api/submissions`: `moderator` or higher
- `PATCH /api/submissions`: `moderator` or higher
- `POST /api/entries`: `editor` or higher
- `GET /api/audit-logs`: `moderator` or higher

Legacy token fallback can be disabled entirely with:

```env
ALLOW_LEGACY_MODERATION_TOKEN_FALLBACK=false
```

Available auth routes:

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/audit-logs`

## Security headers shipped in code

`vercel.json` now ships:

- `Content-Security-Policy`
- `Referrer-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `Origin-Agent-Cluster`

API JSON responses also set defensive headers directly in the handlers.

## Origin policy

- The server no longer treats an empty `ALLOWED_ORIGINS` as `allow all`.
- Protected routes no longer broadly allow requests with no `Origin`.
- When `Origin` is absent, protected browser requests are only accepted if they still present trusted same-site browser signals such as a matching `Referer`.

## Rate limiting

- Production now expects Upstash Redis via REST for distributed rate limiting.
- If Upstash is not configured in production, protected routes fail closed instead of falling back to a process-local memory map.
- `analyze`, `market-scan`, `monitor`, `submissions`, and archive writes are rate limited.

## DNS actions still required

These cannot be shipped from code. They must be set in the DNS provider for `introducing.life`.

If the domain does not send email directly:

```txt
Host: @
Type: TXT
Value: v=spf1 -all
```

```txt
Host: _dmarc
Type: TXT
Value: v=DMARC1; p=reject; adkim=s; aspf=s; pct=100; rua=mailto:dmarc@introducing.life
```

If email is sent through a provider, replace the SPF record with that provider's include chain instead of `-all`.

## Operational note about pentest headers

The live site can return Vercel challenge responses (`x-vercel-mitigated: challenge`) to scanners. That can hide the app's real response headers in automated reports. Deploy the latest `vercel.json` and re-test with a normal browser path or allowlisted scanner to verify the production headers after deploy.
