# Backend setup

The backend is a .NET 10 solution using Clean Architecture. Everything that
runs server-side lives under `chattr_Backend/`.

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| .NET SDK | **10.0.108** or newer | Build, run, migrations, test |
| Docker + Docker Compose | 24+ | Postgres, Redis, Cap, Valkey, Seq (see [`SETUP_BACKEND_DOCKER.md`](./SETUP_BACKEND_DOCKER.md)) |
| psql client (optional) | any | Manually inspecting the DB during dev |

Check your toolchain:

```bash
dotnet --list-sdks    # should show 10.x
docker --version
docker compose version
```

## Solution layout

```
chattr_Backend/
├── Chattr.Api/             # ASP.NET host: Program.cs, endpoints, appsettings
├── Chattr.Core/            # Entities + DTOs (no infra deps)
├── Chattr.Domain/          # Service interfaces only (no infra deps)
├── Chattr.Infrastructure/  # EF Core (AppDbContext), JWT, options, migrations
└── docker-compose.yml
```

Dependencies flow one direction:

```
Chattr.Api  ──┐
              ├──> Chattr.Infrastructure ──> Chattr.Core
Chattr.Infrastructure ──> Chattr.Domain
```

`Chattr.Core` and `Chattr.Domain` know nothing about EF Core, ASP.NET, or JWT.

## Restore + build

```bash
cd chattr_Backend
dotnet restore
dotnet build
```

A clean build should finish with `0 Warnung(en), 0 Fehler`. If you see a
warning about deprecated `JwtBearer` options on a future .NET upgrade,
follow the analyzer's hint.

## Run

The HTTP port is fixed in `Chattr.Api/Properties/launchSettings.json`:

| Profile | URL |
| --- | --- |
| `http`  | `http://localhost:5147` |
| `https` | `https://localhost:7231` + `http://localhost:5147` |

The dev loop uses the `http` profile:

```bash
ASPNETCORE_URLS=http://localhost:5147 \
ASPNETCORE_ENVIRONMENT=Development \
dotnet run --project Chattr.Api/Chattr.Api.csproj
```

`Program.cs` is configured to fail fast if `Jwt:SigningKey` is missing or
shorter than 32 chars (see [`SETUP_BACKEND_SECRETS.md`](./SETUP_BACKEND_SECRETS.md)).
On a clean DB, you'll see:

```
--> PostgreSQL Datenbank wurde erfolgreich migriert, Akh!
--> Seed: created guild 'General' (id=...) for user '...'.
```

## Database & migrations

The project uses EF Core with code-first migrations. The migration files live
in `Chattr.Infrastructure/Migrations/`. Two commands you'll actually use:

```bash
# Create a new migration after changing an entity
dotnet ef migrations add <Name> \
  --project Chattr.Infrastructure \
  --startup-project Chattr.Api

# Apply pending migrations (also runs automatically on `dotnet run`)
dotnet ef database update \
  --project Chattr.Infrastructure \
  --startup-project Chattr.Api
```

`Program.cs` calls `context.Database.MigrateAsync()` on every startup, so
in practice you only need `migrations add` — the `update` happens on next
boot.

**Changing the `Id` type of an existing entity** is the only migration that
needs care: Postgres won't auto-cast `uuid` to `int` even on an empty table.
Delete the rows or drop the table first, then regenerate the migration. The
existing `SwitchUserIdToInt` migration in the repo is a worked example.

## Endpoints

Once running, the live API is at <http://localhost:5147>. The OpenAPI doc
(in dev only) is at <http://localhost:5147/openapi/v1.json>.

| Group | Routes | Auth |
| --- | --- | --- |
| `/api/auth` | `POST /register`, `POST /signin`, `GET /me`, `GET /username-free` | `me` requires bearer |
| `/api/users` | `GET /`, `GET /{id}`, `GET /by-username/{name}` | bearer |
| `/api/guilds` | `GET /`, `DELETE /{id}/members/me` | bearer |
| `/api/guilds/{id}/channels` | `GET /` | bearer |
| `/api/channels/{id}/messages` | `GET /`, `POST /` | bearer |
| `/api/dms` | `GET /`, `POST /with/{userId}`, `GET /{id}/messages`, `POST /{id}/messages` | bearer |
| `/api/presence` | `POST /heartbeat`, `GET /users` | bearer |

## Configuration files

`Chattr.Api/appsettings.json` is the baseline, `appsettings.Development.json`
overrides for dev. Environment variables use the standard `__` separator
(e.g. `Jwt__SigningKey`).

```jsonc
// appsettings.Development.json (paraphrased — never commit real secrets)
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=postgres;Username=chattr;Password=..."
  },
  "Jwt": {
    "SigningKey": "<32+ random chars>",
    "Issuer": "chattr",
    "Audience": "chattr.frontend",
    "AccessTokenMinutes": 60
  },
  "Cors": {
    "AllowedOrigins": ["http://localhost:3000", "http://localhost:3001"]
  }
}
```

For local dev the connection string and JWT key live in
`appsettings.Development.json` because they are throwaway. For anything
real, see [`SETUP_BACKEND_SECRETS.md`](./SETUP_BACKEND_SECRETS.md).

## Smoke test

Once the API is up:

```bash
# Register a user
curl -sS -X POST http://localhost:5147/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"smoke","password":"hunter2hunter2","confirmPassword":"hunter2hunter2","securityQuestion":"first_pet","securityAnswer":"rex"}' | jq

# Username-free check (public)
curl -sS http://localhost:5147/api/auth/username-free?username=smoke | jq

# /me (requires the token from /register or /signin)
TOKEN=...
curl -sS http://localhost:5147/api/auth/me -H "Authorization: Bearer $TOKEN" | jq
```

If any of these return non-2xx, the most common culprits are (in order):
forgot to start the Postgres container, wrong `Jwt:SigningKey`, or the
`AccessTokenMinutes` already elapsed.
