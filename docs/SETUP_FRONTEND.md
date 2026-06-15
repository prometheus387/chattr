# Frontend setup

The frontend is a Next.js 16 + React 19 + HeroUI v3 SPA. It proxies API
calls to the .NET backend through a server-side rewrite so the browser
always sees the same origin (no CORS).

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | **20.9.x or newer** (22.x recommended) | Required by Next 16 |
| pnpm | 9+ | Package manager (this repo uses `pnpm-lock.yaml`) |

Check your toolchain:

```bash
node --version     # v20.9+ or v22+
pnpm --version     # 9+
```

If you don't have pnpm, install it once:

```bash
npm install -g pnpm
```

…or use `corepack`:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## Install dependencies

```bash
cd chattr_Frontend
pnpm install --frozen-lockfile
```

`--frozen-lockfile` ensures `pnpm-lock.yaml` is used exactly. Drop the flag
if you want to allow the lockfile to update (e.g. when adding a new
package).

If you previously ran the project on a different Node version and
`pnpm install` complains about a corrupted store:

```bash
rm -rf node_modules
pnpm install --frozen-lockfile
```

## Environment variables

Create `chattr_Frontend/.env.local` with the following:

```dotenv
# Server-only. Used by next.config.mjs to proxy /api/* to the .NET API.
# In dev: the API listens on http://localhost:5147.
# In production: whatever your reverse proxy or sidecar exposes internally.
INTERNAL_API_URL=http://localhost:5147

# If you wire the Cap captcha widget into the auth forms:
NEXT_PUBLIC_CAP_SITEKEY=...      # the public sitekey from your Cap container
```

Notes:

- **`INTERNAL_API_URL` is server-only.** It never reaches the browser
  bundle. The browser only ever calls same-origin `/api/...` paths.
- **`NEXT_PUBLIC_*` is exposed to the browser.** Don't put real secrets
  there. Use it only for things that are safe to ship in JS (sitekeys, public
  config flags, etc.).
- The repo's `.env.local` is in `.gitignore`. **Do not commit it.** A
  reference template (`.env.example`) is fine to commit.

## Run

```bash
pnpm dev               # http://localhost:3000
```

The dev server does hot module replacement. Open the URL in your browser
and you should see the landing page.

The first time you run, Next.js compiles routes on demand — the first
request to `/client` takes a few seconds.

### Other scripts

```bash
pnpm build             # production build
pnpm start             # serve the production build (after `pnpm build`)
pnpm exec tsc --noEmit # type-check
pnpm run lint          # eslint --fix (note: eslint config has a pre-existing
                      # incompatibility with the @next/next/recommended v16
                      # plugin; use `tsc --noEmit` until that's resolved)
```

### Picking a different port

The first few scripts bind to `3000` by default. The chat client + the
backend dev defaults assume `:3000`, but the CORS config in the backend
also allows `:3001`, `:3002`, and `:3003`:

```bash
pnpm dev -- --port 3002
```

…or for the production build:

```bash
pnpm start -- --port 3002
```

## How the same-origin proxy works

`next.config.mjs` declares a single `rewrites()` rule:

```js
{
  source: "/api/:path*",
  destination: `${INTERNAL_API_URL}/api/:path*`,
}
```

When the browser calls `/api/auth/signin`, Next.js opens a server-side
request to `INTERNAL_API_URL/api/auth/signin` and streams the response
back. The browser never sees a cross-origin call, so:

- No CORS preflight is ever needed
- The `Authorization: Bearer …` header is preserved as-is
- 401 from the API is forwarded as a 401 to the browser

In production the pattern is the same — you just point
`INTERNAL_API_URL` at whatever internal address your reverse proxy or
sidecar exposes. The browser still only sees the Next.js origin.

### Profile-page rewrites

Same trick, separate routes:

```js
{ source: "/u/:username",      destination: "/profile/username/:username" }
{ source: "/user/:username",   destination: "/profile/username/:username" }
{ source: "/i/:id",            destination: "/profile/id/:id" }
{ source: "/id/:id",           destination: "/profile/id/:id" }
```

The browser URL stays as the user typed it; the actual page lives at
`/profile/[kind]/[value]/page.tsx`.

## Auth flow at a glance

The frontend never has to touch the JWT directly. The flow:

1. `POST /api/auth/register` or `/api/auth/signin` returns
   `{ token, expiresAt, user }`.
2. `contexts/auth-provider.tsx` writes the token to `localStorage`
   (key `chattr.auth.token`) and updates the auth state.
3. The API client (`lib/api.ts`) reads the token via a `setAuthTokenProvider`
   hook and attaches it as `Authorization: Bearer …` on every request.
4. On 401, the auth provider clears the token and redirects to `/signin`.

The token in `localStorage` is a deliberate demo choice. In production,
move it to an `HttpOnly; Secure; SameSite=Strict` cookie set by the API
on `/api/auth/signin` and read by the API on subsequent requests — see
[`SETUP_BACKEND_SECRETS.md`](./SETUP_BACKEND_SECRETS.md) for the production
checklist.

## Project layout

```
chattr_Frontend/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # root layout (Providers, Navbar, <main>)
│   ├── page.tsx              # /
│   ├── signin/page.tsx       # /signin
│   ├── register/page.tsx     # /register
│   ├── client/page.tsx       # /client (the chat UI)
│   ├── profile/[kind]/[value]/page.tsx   # /u/..., /i/..., etc.
│   └── ...
├── components/
│   ├── client/               # GuildSidebar, ChannelSidebar, MessageList, …
│   ├── landing/              # Hero, TrustStrip, Features, auth forms, …
│   └── navbar.tsx
├── contexts/
│   └── auth-provider.tsx     # the AuthContext (provider + useAuth())
├── lib/
│   ├── api.ts                # typed fetch wrapper + ApiError class
│   ├── auth-storage.ts       # localStorage helpers + JWT exp decoder
│   └── presence.ts           # online-status helper
├── types/
│   ├── api.ts                # PublicUser, AuthResponse, ApiError
│   └── client.ts             # GuildSummary, Channel, Message, Dm*, …
├── config/site.ts
├── next.config.mjs
├── package.json
├── tsconfig.json
└── .env.local                # not committed
```

## Smoke test

With both the API and the frontend running:

1. Open <http://localhost:3000>.
2. Click **Register** → fill the form → submit.
3. You should land on `/signin` (or `/client` if the form auto-redirects).
4. Sign in with the credentials you just registered.
5. Land on `/client`. The leftmost sidebar should show the home icon
   (DMs) plus a "G" (your default Guild).
6. Click a channel — the chat panel updates with the conversation.
7. Click a user in the right-side "Users" list — the profile page opens
   at `/i/<id>`.

If the page shows "Loading…" forever, the auth provider couldn't
reach `/api/auth/me`. Check the browser console — most likely causes:

- `.env.local` has the wrong `INTERNAL_API_URL`
- The .NET API isn't running
- The API's `Cors:AllowedOrigins` doesn't include `http://localhost:3000`
  (only matters if you changed the CORS strategy away from the
  rewrite-proxy — see "How the same-origin proxy works" above)

## Building for production

```bash
pnpm build
```

Output goes to `.next/`. Serve it with:

```bash
pnpm start            # defaults to port 3000
# or
pnpm start -- --port 3001
```

In production you'll typically:

1. Run `pnpm build` during the deploy step.
2. Run `pnpm start` behind a reverse proxy (nginx, Caddy, k8s ingress).
3. The reverse proxy terminates HTTPS and forwards plain HTTP to
   `localhost:3000` (or wherever you bound `pnpm start`).
4. The same proxy forwards `/api/*` to the .NET API container (or
   `INTERNAL_API_URL` can point at the API's unix socket / private
   network address).

The frontend bundle never embeds any API URL — only the server-side
`INTERNAL_API_URL` is used at request time.

## ESLint

There's a pre-existing incompatibility in `eslint.config.mjs` with
`@next/next/recommended` v16 (the plugin exports a top-level `name`
property that the older `FlatCompat` shim doesn't understand). Until
that's resolved upstream, use the TypeScript compiler for type-level
checks:

```bash
pnpm exec tsc --noEmit
```

…and avoid `pnpm run lint` (it currently fails on the plugin import).
