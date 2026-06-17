# Phase 1 — E2EE Foundation

This is the **data model + client key management** layer
of the Chattr rewrite. Phase 2 will integrate the new
code into the existing build (the Channel/Message
entities get replaced, the IP-block middleware slots
into Program.cs, the burn-account handler mounts at
`/api/users/me`, and the KeyProvider wraps the
authenticated app). The split lets the cryptographic
core land in reviewable units without the churn of a
full migration.

## Threat model (one paragraph)

The server is **untrusted**. The user's PGP private
key never leaves their device in plaintext. The
channel's AES key never leaves the server in
plaintext — the server only ever holds it encrypted
to each member's PGP public key. A database dump
(backup exfiltration, SQL injection, rogue admin)
yields ciphertext + wrapped keys + public keys,
which is not enough to read any message. The threat
the system does *not* defend against is a compromised
client (XSS, malicious extension) — the React state
holding the unlocked key is reachable from any
script that runs in the same origin. CSP + standard
XSS hardening are the second line of defence.

## Files

### Backend

| File | Purpose |
| --- | --- |
| `chattr_Backend/Chattr.Core/Entities/E2EE/Channel.cs` | Channel with E2EE metadata (IsEphemeral, RotationInterval, NextRotationUtc, ClearOnRotation). No plaintext anywhere. |
| `chattr_Backend/Chattr.Core/Entities/E2EE/Message.cs` | Encrypted message row: ciphertext + KeyVersion. Replaces the existing Message's plaintext `Content` field. |
| `chattr_Backend/Chattr.Core/Entities/E2EE/GroupChannelKey.cs` | The channel's AES key, wrapped per-user with the user's PGP public key. The server can write these but cannot read them. |
| `chattr_Backend/Chattr.Api/Middleware/IpBlockOptions.cs` | Strongly-typed options for the IP block. |
| `chattr_Backend/Chattr.Api/Middleware/IpBlockMiddleware.cs` | Reads `CF-Connecting-IP` first, falls back to `X-Forwarded-For` only when the immediate hop is a trusted proxy. |
| `chattr_Backend/Chattr.Api/Middleware/CloudflareIps.cs` | Cloudflare's published v4 + v6 ranges; `ApplyAsTrustedProxies()` extension. |
| `chattr_Backend/Chattr.Api/Endpoints/Auth/BurnAccountHandlers.cs` | `DELETE /api/users/me` — irreversible hard-delete of the user + their ciphertexts + their wrapped keys. |

### Frontend

| File | Purpose |
| --- | --- |
| `chattr_Frontend/lib/crypto/keyGen.ts` | PGP key generation (`curve25519`) + decrypt/re-encrypt via `openpgp.js`. |
| `chattr_Frontend/lib/crypto/wrap.ts` | AES-GCM at-rest encryption. PBKDF2-SHA256, 600k iterations. Non-extractable wrapping key. |
| `chattr_Frontend/lib/crypto/storage.ts` | IndexedDB envelope via `idb-keyval`. Stores `{wrapped, salt, iv, publicKeyArmored, fingerprint, createdAt}`. |
| `chattr_Frontend/lib/crypto/keyStore.tsx` | React context: hydrates from IndexedDB on mount, exposes `generate / unlock / lock / forget / reset`. |
| `chattr_Frontend/components/settings/KeyExportCard.tsx` | HeroUI card. Export the in-RAM private key as a `.asc` file, with a confirm dialog explaining the blast radius. |

## Required npm packages (Phase 2)

```jsonc
// package.json (excerpt)
{
  "dependencies": {
    "openpgp": "^5.11.2",
    "idb-keyval": "^6.2.1",
    "@heroui/react": "^2.4.6",
    "framer-motion": "^11.5.0"  // peer dep of @heroui/react
  }
}
```

## Required NuGet packages (Phase 2)

No new packages. The E2EE entities are plain EF Core
POCOs; the middleware is `Microsoft.AspNetCore.Http`
boilerplate; the burn-account handler is `EFCore`
plus `EFCore.Relational` (already in the project).

## Integration plan (Phase 2)

1. **Backend**:
   - Add the E2EE entities to `AppDbContext`
     (`OnModelCreating`), set the FK cascades per the
     comments in `BurnAccountHandlers` (Message /
     GroupChannelKey cascade on user delete; the
     existing Message FK on `Restrict` is the reason
     BurnAccountHandlers explicitly removes those
     rows first).
   - Drop the existing `Channel` / `Message` / etc.
     tables OR migrate their `Content` data to
     ciphertext (Phase 2 is a clean rewrite, not a
     migration — the latter is its own project).
   - Mount `IpBlockMiddleware` in `Program.cs` *before*
     auth so blocked IPs can't even hit `/api/auth/*`.
     - Add to `appsettings.json`:
       ```jsonc
       "IpBlock": {
         "TrustForwardedHeaders": false,
         "UseCloudflareHeaders": true,
         "BlockedRanges": [],
         "TrustedProxies": []
       }
       ```
     - At startup, call
       `services.PostConfigure<IpBlockOptions>(o => o.ApplyAsTrustedProxies())`
       so Cloudflare's published ranges are populated
       by default. Operators can override the list in
       config.
   - Map `app.MapDelete("/api/users/me", BurnAccountHandlers.BurnAccount)`
     under the `RequireAuthorization()` group.
2. **Frontend**:
   - Wrap the authenticated app root in
     `<KeyProvider>` (the provider hydrates from
     IndexedDB on mount and exposes the `useKeyStore`
     hook).
   - Mount `<KeyExportCard />` in the settings
     page. Add sibling cards for "Generate / unlock /
     change passphrase" — they share the same
     `useKeyStore` actions.
   - When posting a message, encrypt with the
     channel's current AES key (fetched from the
     server as a wrapped blob, unwrapped with the
     unlocked PGP key, AES-GCM-decrypted for reading
     / -encrypted for writing). The wrapped-blob
     fetch lives in `lib/crypto/channelKey.ts` (TBD).
   - Replace the existing channel/message fetch
     paths: the server now returns ciphertext, the
     client decrypts locally before rendering.

## Open questions for Phase 2

- **Recovery**: how does a user with a lost device
  recover? Spec doesn't say. Options: (a) an
  out-of-band recovery key the user prints at
  generation time, (b) the user can re-issue a new
  PGP key from the server side and re-wrap every
  channel key for it. (a) is the spec's "burn" but
  inverted. Default plan: implement (a) as a recovery
  card in the settings page; leave (b) for later.
- **Multi-device**: when the same user has two
  devices, each device needs its own PGP key (the
  wrapped channel key only unwraps with the
  recipient's key). The server has to wrap every
  channel key for every device the user has. Not a
  Phase-2 blocker but worth planning.
- **Server-side search**: a feature like "find a
  message containing X" needs server-side
  participation, which contradicts the threat model
  (the server can't see plaintext). Solution: do
  search client-side on decrypted history, or use a
  searchable-encryption scheme. Out of scope for
  Phase 1.
