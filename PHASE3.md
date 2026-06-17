# Phase 3 — Live Chat + Burn Account

The completion of the E2EE chat layer. Two halves:

* **Live broadcast** via SignalR with the spec's
  dual-mode behaviour: standard channels persist the
  ciphertext, ephemeral channels never touch the
  database.
* **Burn Account** — the irreversible, one-way hard
  delete. The modal orchestrates the local cleanup
  (IndexedDB wipe + in-RAM key-store lock) **before**
  calling the server's `DELETE /api/users/me`.

The Phase-3 components plug into the Phase-1+2
foundation (entities, JWT, key store, channel-key
store) without breaking any of it.

## Backend

| File | Purpose |
| --- | --- |
| `Chattr.Api/Hubs/E2eeChatHub.cs` | SignalR hub. `JoinChannel / LeaveChannel / SendMessage`. Persists standard, broadcasts-only for ephemeral. Returns `SendMessageResultDto` so the sender can reconcile. |
| `Chattr.Api/Endpoints/E2EE/E2eeMessageHandlers.cs` | REST alternative to the hub. `GET /api/e2ee/channels/{id}/messages` (empty for ephemeral). `POST` is 400'd for ephemeral channels. |
| `Chattr.Api/Endpoints/Auth/BurnAccountRoutes.cs` | Mounts `DELETE /api/users/me` (`MapBurnAccountEndpoint`). |
| `Chattr.Api/Endpoints/Auth/BurnAccountHandlers.cs` | The destructive handler. One transaction, explicit per-table cleanup (E2EE messages, wrapped keys, channel memberships, GuildBans, GuildInvites, GuildVouches, UserPgpKey, GuildMembers), then `context.Users.Remove(user)`. |
| `Chattr.Api/Endpoints/HubRoutes.cs` | `app.MapHub<E2eeChatHub>("/hubs/e2ee-chat")`. |
| `Chattr.Api/Endpoints/RouteRegistrar.cs` | Wires the new endpoints. |
| `Chattr.Api/Program.cs` | `AddSignalR` with `MaximumReceiveMessageSize = 1 MiB`; `app.MapE2eeChatHub()` after `RegisterAllEndpoints()`. |

### Endpoint summary

```
DELETE /api/users/me                                Burn (Phase 1 + Phase 3 cascade)
GET    /api/e2ee/channels/{id}/messages?limit=N     History (empty for ephemeral)
POST   /api/e2ee/channels/{id}/messages             REST send (rejected for ephemeral)
WS     /hubs/e2ee-chat                               SignalR hub (Live + Ephemeral broadcast)
```

### Hub protocol

The hub mounts at `/hubs/e2ee-chat` and is `[Authorize]`-d
at the class level — the same JWT bearer that
authenticates the REST endpoints also gates the
WebSocket upgrade.

* `JoinChannel(int channelId)` — adds the caller to
  the `channel-{id}` group. Throws on non-member.
* `LeaveChannel(int channelId)` — explicit group
  leave (auto-leave on disconnect handles the rest).
* `SendMessage(SendMessageDto)` — central method.
  * `IsEphemeral` = false: persist the row, then
    broadcast the persisted envelope.
  * `IsEphemeral` = true: **no database write**;
    broadcast the supplied ciphertext with a
    client-generated `EphemeralId`.
* `ReceiveMessage(LiveMessageDto)` (client-side
  callback): the typed message envelope with all
  fields including `IsEphemeral` and `EphemeralId`.

## Frontend

| File | Purpose |
| --- | --- |
| `lib/crypto/signalr.ts` | The SignalR client wrapper. `getConnection` is a per-tab singleton. `joinChannel / leaveChannel / sendMessage / onReceiveMessage / fetchHistory / closeConnection`. |
| `lib/crypto/aes-gcm.ts` | The encryption primitive. `encryptMessage(plaintext, key) → base64(nonce ‖ ct ‖ tag)` and the inverse. `newEphemeralId` (UUID v4 with fallback). |
| `components/channels/ChatWindow.tsx` | The HeroUI chat window. Dual-mode (standard / ephemeral). Loads history on mount for standard, decrypts each on the way in, dedupes by stable id. |
| `components/auth/BurnAccountModal.tsx` | HeroUI confirm-modal. Phase 1: close SignalR. Phase 2: wipe IndexedDB. Phase 3: lock in-RAM stores. Phase 4: call `api.burnAccount()`. Phase 5: redirect to `/signin?burned=1`. Type-the-name gate. |
| `lib/api.ts` | Added `api.burnAccount: () => request<void>("/api/users/me", { method: "DELETE" })`. Added `api.e2ee.getMessages(channelId, limit)`. |

### Crypto design

* `crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, …)` for fresh keys
  (rotation flow).
* `crypto.subtle.exportKey('raw', …)` to get the
  raw 32 bytes for the per-member PGP wrap.
* `crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)` →
  `ct ‖ tag` (webcrypto concatenates them).
* Wire format: `base64(nonce(12) ‖ ct ‖ tag(16))`.
  The 12-byte nonce is fresh per message via
  `crypto.getRandomValues`. Reuse would break GCM
  security; the spec for ephemeral explicitly demands
  this.

### ChatWindow phases

1. **Mount** — on `channel.id` change, ensure the
   channel AES key is in RAM (`ensureUnlocked`).
2. **Connect** — `getConnection(authToken)` returns
   the per-tab singleton. `joinChannel(conn, id)`.
3. **Subscribe** — `onReceiveMessage(conn, id, …)`
   wires the live receive handler. On unmount we
   `leaveChannel` and (for ephemeral) clear the
   in-RAM list so a F5 doesn't bring it back.
4. **History** — standard channels only. `fetchHistory`
   pulls up to 50 messages, decrypts each (cached by
   ciphertext), and replaces the in-RAM list. Ephemeral
   channels skip this step entirely; the spec is
   explicit: "beim Betreten kein Verlauf geladen".
5. **Send** — `encryptMessage(text, key)` →
   `sendMessage(conn, { ciphertext, keyVersion, ephemeralId? })`.
   The hub broadcasts back; we receive our own message
   like everyone else's (no special sender branch).

### Burn Account order of operations

1. Close the SignalR connection (`void closeConnection` —
   best-effort because a hung hub shouldn't block the
   local wipe).
2. Wipe IndexedDB:
   - `clearKey()` — idb-keyval's clear of the
     `chatter-secrets-db` store.
   - `indexedDB.databases()` (where available) →
     `indexedDB.deleteDatabase(name)` for every
     database in the origin. The spec explicitly
     requires "die gesamte lokale IndexedDB", not
     just ours.
3. Lock the in-RAM key stores (`getKeyStoreInstance().lock()`,
   `getChannelKeyStoreInstance().clearAll()`). The
   singletons now point at "unarmed" stores; the GC
   can collect the CryptoKey objects on the next tick.
4. `api.burnAccount()` — server-side hard delete.
5. `window.location.href = "/signin?burned=1"` — hard
   navigation clears the rest of the tab state.

## Tests

`/tmp/test_phase3.py` — HTTP surface smoke (negotiate=200,
messages=404, burn=200).
`/tmp/test_burn_real.py` — full round-trip:
  - register a throwaway user (201)
  - sign in, get id
  - burn → 204
  - `/api/auth/me` with the burned token → 401
  - The user row is gone.

## Phase 3 follow-ups (not in this turn)

* The SignalR hub is in-process. For multiple
  instances, the Phase-2 spec called for a Redis
  backplane (`AddStackExchangeRedis`). Phase 3 ships
  the hub itself; the backplane is a one-line
  `services.AddSignalR().AddAzureSignalR()` (or
  StackExchangeRedis) when the deployment grows.
* The Burn-Account modal currently runs the local
  wipe *before* the server call. If the user
  navigates away mid-flow, the server record survives.
  Acceptable per spec (the server-side retention job
  is mentioned in the modal copy), but a future
  improvement would be a `navigator.sendBeacon`-style
  fire-and-forget call on `pagehide` that re-fires the
  server delete from the closing tab.
* The `ChatWindow` accepts the channel as a prop
  (parent decides which channel is active). The
  parent component (the client page) needs to wire
  this up — when a channel card in the sidebar is
  clicked, swap the active channel and pass it to
  `<ChatWindow channel={…} authToken={…} />`. The
  parent wiring is the next step.
