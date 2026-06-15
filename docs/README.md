# Docs

| Setup guide | Covers |
| --- | --- |
| [`SETUP_BACKEND.md`](./SETUP_BACKEND.md) | .NET 10 API: install, build, run, migrations, dev loop |
| [`SETUP_BACKEND_SECRETS.md`](./SETUP_BACKEND_SECRETS.md) | JWT key, DB password, CORS, Cap, Seq — how to keep them out of the repo |
| [`SETUP_BACKEND_DOCKER.md`](./SETUP_BACKEND_DOCKER.md) | The `docker-compose.yml` services (Postgres, Redis, Cap, Valkey, Seq) |
| [`SETUP_FRONTEND.md`](./SETUP_FRONTEND.md) | Next.js 16 + HeroUI: install, env, build, same-origin API proxy |

## TL;DR — full local dev from a fresh clone

```bash
# 1. infra
cd chattr_Backend
docker compose up -d                  # postgres, redis, cap, valkey, seq
# copy secrets (see SETUP_BACKEND_SECRETS.md) and write them to your .env

# 2. backend
dotnet restore
dotnet build
ASPNETCORE_URLS=http://localhost:5147 \
  ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project Chattr.Api/Chattr.Api.csproj

# 3. frontend (in a second terminal)
cd ../chattr_Frontend
pnpm install
# write .env.local (see SETUP_FRONTEND.md)
pnpm dev                              # http://localhost:3000
```

Open <http://localhost:3000>, sign up, and you should land on `/client`.
