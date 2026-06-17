# Phase 2 — E2EE Workflows (Add-Member + Rotation)

Builds on the Phase-1 foundation (entities in
`Chattr.Core/Entities/E2EE/`, client crypto in
`chattr_Frontend/lib/crypto/`) with the missing
operational pieces:

* **Add-Member** with server-side PGP-recipient
  validation (the server doesn't trust the client's
  word that the wrap is addressed to the right user).
* **Rotation** with optional clear-on-rotate (the
  "nuclear" cleanup of stale ciphertext).
* **Just-in-time rotation hook** that runs whenever
  the user opens a channel whose `NextRotationUtc` is
  in the past.
* **Channel settings card** with the spec-mandated
  warning text.

## Backend

| File | Purpose |
| --- | --- |
| `Chattr.Core/Entities/E2EE/Channel.cs` | Added `CreatedByUserId` + `ChannelMember` join entity. |
| `Chattr.Core/Entities/UserPgpKey.cs` | Per-user PGP public-key row. |
| `Chattr.Core/Entities/User.cs` | Added `PgpKeys` navigation. |
| `Chattr.Core/DTOs/E2EE/E2eeDtos.cs` | Request / response shapes. |
| `Chattr.Infrastructure/Services/Pgp/PgpService.cs` | BouncyCastle wrapper: key-id + recipient-validity checks. |
| `Chattr.Infrastructure/Services/E2EE/ChannelKeyService.cs` | Business logic for Add-Member + Rotate. |
| `Chattr.Infrastructure/Data/AppDbContext.cs` | DbSet + FK config for the new tables. |
| `Chattr.Api/Endpoints/E2EE/E2eeChannelHandlers.cs` | HTTP layer for `/api/e2ee/channels/{id}/...`. |
| `Chattr.Api/Endpoints/E2EE/E2eePublicKeyHandlers.cs` | HTTP layer for `/api/users/{id}/pgp-key` + `/api/users/me/pgp-key`. |
| `Chattr.Api/Endpoints/E2EE/E2eeRoutes.cs` | `MapE2eeChannelEndpoints` + `MapE2eePublicKeyEndpoints`. |
| `Chattr.Api/Program.cs` | DI registration for `ChannelKeyService`. |
| `Chattr.Api/Endpoints/RouteRegistrar.cs` | `MapE2ee*Endpoints()` calls. |
| `Chattr.Infrastructure/Chattr.Infrastructure.csproj` | New `<PackageReference>` for `BouncyCastle.Cryptography` 2.4.0. |
| Migration `20260617024952_AddE2eePhase2` | Schema: `UserPgpKeys`, `E2eeChannels`, `E2eeChannelMembers`, `E2eeMessages`, `E2eeGroupChannelKeys`. |

### Endpoint summary

```
GET    /api/users/me/pgp-key          → UserPgpKeyDto
PUT    /api/users/me/pgp-key          UploadPgpKeyDto → { fingerprint }
GET    /api/users/{id}/pgp-key        → UserPgpKeyDto  (public by design)

GET    /api/e2ee/channels/{id}                 Channel detail
PATCH  /api/e2ee/channels/{id}                 UpdateE2eeChannelDto

GET    /api/e2ee/channels/{id}/members          List members
POST   /api/e2ee/channels/{id}/members          AddE2eeMemberDto (validated server-side)

GET    /api/e2ee/channels/{id}/my-key            Caller's wrapped key
GET    /api/e2ee/channels/{id}/public-keys      All members' public keys
POST   /api/e2ee/channels/{id}/rotate           RotateChannelKeysDto
```

## Frontend

| File | Purpose |
| --- | --- |
| `chattr_Frontend/lib/crypto/keyStore.tsx` | Module-level `getKeyStoreInstance()` + `KeyProvider` (extended from Phase 1). |
| `chattr_Frontend/lib/crypto/channelKey.tsx` | Per-channel AES-key store with `getChannelKeyStoreInstance()`. |
| `chattr_Frontend/lib/crypto/peerInvite.ts` | The Add-Member workflow: fetch peer key → wrap → POST. |
| `chattr_Frontend/lib/crypto/rotation.ts` | The JIT rotation logic. |
| `chattr_Frontend/components/channels/RotationWatcher.tsx` | The hook that fires when a channel opens. |
| `chattr_Frontend/components/settings/ChannelSettingsCard.tsx` | HeroUI card. **Shows the literal warning text `"Warnung: Das zieht ultra an deinen ressourcen"` when the user un-checks ClearOnRotation.** |
| `chattr_Frontend/lib/api.ts` | Added `api.e2ee.*` namespace. |

## Required NuGet packages (already added)

* `BouncyCastle.Cryptography` 2.4.0 — the only Phase-2
  new dep. Used server-side for PGP recipient-key-id
  validation.

## Required npm packages (still pending)

* `openpgp` ^5.11.2 (Phase 1)
* `idb-keyval` ^6.2.1 (Phase 1)
* `@heroui/react` ^2.4.6 (Phase 1)
* `framer-motion` ^11.5.0 (Phase 1, peer of HeroUI)

Once installed: `npx tsc --noEmit` will pass.

## Phase-3 follow-ups (not in this turn)

* `E2eeChannelHandlers` returns 404 for "you're not the
  creator" rather than 403, on purpose — keeps the
  app's "don't leak existence" pattern. If we ever
  want to broaden admin rights to a guild-admin
  role, this gate has to become a proper 403.
* The rotation flow uses one round-trip per member
  for the wrap. For channels with many members, a
  future optimisation is to do the wraps in parallel
  batches of 8–16 (the browser's
  `navigator.hardwareConcurrency`).
* `ChannelSettingsCard` does not yet expose
  `RotationInterval`. The backend PATCH supports it;
  the UI control is Phase-3 (a `<Select>` of common
  presets: hourly, daily, weekly).
* The JIT watcher does not auto-retry on a race-loss
  (the server returns 400 "newKeyVersion must be
  exactly N+1" if another client rotated first). For
  Phase 3 we add a one-shot retry: re-read
  `myKey` and bump by 1.
