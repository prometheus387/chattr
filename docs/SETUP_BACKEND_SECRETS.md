# Backend secrets

Every secret the API needs at runtime, where it lives, and how to handle
each one. Nothing in this file should ever be copy-pasted into a config file
that's committed to git.

## What counts as a secret

| Secret | Used by | Where it ends up |
| --- | --- | --- |
| `Jwt:SigningKey` | Backend (signs + verifies JWTs) | Symmetric HS256 key, ≥ 32 chars |
| `ConnectionStrings:DefaultConnection` (password) | Backend → Postgres | Npgsql connection string |
| `Cors:AllowedOrigins` | Backend CORS middleware | Lower-risk; depends on the deployment |
| `CAP_ADMIN_KEY` | Docker (Cap container) | Admin dashboard of the Cap captcha service |
| `CAP_SECRETKEY` / `CAP_SITEKEY` | Frontend + Cap | hCaptcha-style keys, public sitekey, private secretkey |
| `SEQ_FIRSTRUN_ADMINPASSWORDHASH` | Docker (Seq container) | Initial admin password for Seq |
| Cookie auth / refresh tokens (future) | Backend | Encrypted at rest in the DB |

The JWT signing key is the most important one — anyone who has it can mint
tokens for any user.

## Where secrets live in dev

The dev defaults live in `Chattr.Api/appsettings.Development.json`, which
**is committed** because all the values are throwaway. Production should
**never** read secrets from a committed file.

`.env` files in `chattr_Backend/` (e.g. `POSTGRES_PASSWORD`,
`SEQ_FIRSTRUN_ADMINPASSWORDHASH`) are read by `docker compose` and should be
in `.gitignore` — see [`.gitignore`](#gitignore) below.

## Recommended pattern by environment

### Local dev (any developer)

Use `dotnet user-secrets` for per-developer overrides that override
`appsettings.Development.json` without touching the repo:

```bash
cd chattr_Backend/Chattr.Api
dotnet user-secrets init   # one-time, generates a secrets.json in the user profile

# Add the dev secrets
dotnet user-secrets set "Jwt:SigningKey" "$(openssl rand -base64 48 | tr -d '\n=' | head -c 64)"
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=postgres;Username=chattr;Password=dev-local-pw"
dotnet user-secrets set "Cors:AllowedOrigins[0]" "http://localhost:3000"
```

Inspect / clear:

```bash
dotnet user-secrets list
dotnet user-secrets clear
```

These are stored in `~/.microsoft/usersecrets/<id>/secrets.json` on
Linux/macOS — outside the repo, so they don't leak via git.

### CI

Pass the values as **environment variables** to `dotnet build` and the test
runner. In GitHub Actions / GitLab CI / etc. use the platform's secret store
(GitHub Actions Secrets, GitLab CI variables) and inject as env. The
convention is `__` for hierarchy:

```bash
Jwt__SigningKey=...
ConnectionStrings__DefaultConnection="Host=db;..."
```

### Staging / production

Pick one of the following — in order of how common they are:

1. **Environment variables** on the host (simplest, e.g. systemd `EnvironmentFile=`).
2. **Docker / k8s secrets** mounted into the container at `/run/secrets/...`.
3. **Managed secret store**: Azure Key Vault, AWS Secrets Manager, GCP Secret Manager.
4. **HashiCorp Vault** if you have a Vault cluster.

The `Chattr.Api` program reads config from the standard .NET sources
(`appsettings.json` → env vars → command-line args → user-secrets in dev).
Whatever you mount, it just works as long as the keys match the
configuration names.

## Generating strong secrets

| Need | Command |
| --- | --- |
| 32+ char random string (HS256 key) | `openssl rand -base64 48` (trim or pad to ≥ 32) |
| 64 hex chars (also valid for HS256) | `openssl rand -hex 32` |
| Postgres password | `openssl rand -base64 24` |
| Seq admin password (PBKDF2 hash) | Use the tool from <https://docs.datalust.co/docs/admin-password-hash> |

The .NET `[MinLength(32)]` data annotation on `JwtOptions.SigningKey`
rejects anything shorter on startup, so don't worry about accidentally
passing a 16-byte string — the app will crash with a clear error.

## Replacing the dev JWT key

`appsettings.Development.json` currently ships with a placeholder
`dev-only-do-not-use-in-prod-…` signing key. That works locally but:

- The repo is public, so the key is public. Anyone with the key can mint
  tokens for any user. **This is fine for dev only.**
- In any non-dev environment, **replace the key**. The `Program.cs` validates
  the key length on startup, so a short prod key will fail loudly.

Steps to rotate:

1. Generate a new key: `openssl rand -base64 48 | tr -d '\n=' | head -c 64`
2. Set it in your secret store (user-secrets, env, Key Vault, …).
3. Restart the API.
4. All existing tokens signed with the old key are now invalid — users have
   to sign in again. That's expected.

## CORS origins

`Cors:AllowedOrigins` is **not** a secret, but it controls who can call your
API. Two principles:

- List each origin you actually serve the frontend from.
- Don't use a wildcard (`*`) — the API also sends credentials, so wildcards
  are rejected by browsers anyway.

Default dev origins (in `appsettings.Development.json`):

```jsonc
"Cors": {
  "AllowedOrigins": [
    "http://localhost:3000",
    "https://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003"
  ]
}
```

In prod: set this to your real frontend URL (`https://chattr.example.com`).
The frontend proxies API calls through Next.js, so the browser only ever sees
the frontend origin — but the backend's CORS check still needs to allow it
in case someone hits the API directly.

## Cap (captcha) keys

Cap is the captcha service in `docker-compose.yml`. It needs an
`ADMIN_KEY` for its admin API, plus a `SECRETKEY` (private) and `SITEKEY`
(public, sent to the browser).

- `CAP_ADMIN_KEY` — admin API token, never sent to the browser
- `CAP_SECRETKEY` — server-side verification, never sent to the browser
- `CAP_SITEKEY` — **public**, embedded in the frontend's captcha widget

Both keys are generated by the Cap container on first run. To rotate:

```bash
docker compose exec cap cap admin reset
```

…then copy the new values into your `.env` and restart the stack.

## Seq admin password

Seq's first-run setup uses `SEQ_FIRSTRUN_ADMINPASSWORDHASH` (a PBKDF2 hash,
not the plain password). On first boot, this becomes the admin's password.
After that, log in at <http://localhost> and change it under *Settings → Users*.

To compute a fresh hash:

```bash
docker run --rm datalust/seq:latest hash-password 'MyNewPassword'
```

Paste the output (just the hash, not the username line) into
`SEQ_FIRSTRUN_ADMINPASSWORDHASH` in your `.env`.

## .gitignore

Make sure the following are in the root `.gitignore` of the repo:

```gitignore
# Local env files (real secrets)
.env
.env.local
.env.*.local
appsettings.*.local.json

# .NET user-secrets — already outside the repo, but be safe
secrets.json

# Build artifacts
.next/
bin/
obj/
```

`.env.example` files (placeholder, no real values) **should** be committed
so a new contributor can `cp .env.example .env` and fill it in.

## Audit checklist before going to prod

- [ ] `Jwt:SigningKey` is a fresh `openssl rand` output, not the dev one
- [ ] `ConnectionStrings:DefaultConnection` password is not in the repo
- [ ] `appsettings.Production.json` (or env vars) sets
      `Cors:AllowedOrigins` to the real frontend URL
- [ ] No `.env` or `appsettings.*.local.json` is in the repo
- [ ] `SEQ_FIRSTRUN_ADMINPASSWORDHASH` is set, and the Seq admin password
      has been changed since first boot
- [ ] If you use Cap in production, rotate `CAP_ADMIN_KEY`,
      `CAP_SECRETKEY`, and `CAP_SITEKEY` after first boot
- [ ] HTTPS termination happens before requests reach the API
      (e.g. nginx / Caddy / k8s ingress)
