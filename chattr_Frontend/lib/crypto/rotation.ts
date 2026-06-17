"use client";

/**
 * Just-in-time key rotation. The RotationWatcher
 * component calls <c>maybeRotate(channelId)</c> on
 * mount; that function:
 * <list type="number">
 *   <item>Fetches the channel metadata. If
 *         <c>NextRotationUtc</c> is in the future,
 *         nothing to do.</item>
 *   <item>Generates a fresh AES-256 key.</item>
 *   <item>Fetches the public keys of every current
 *         member (one round-trip).</item>
 *   <item>Wraps the new key for each member using
 *         their PGP public key.</item>
 *   <item>POSTs the bundle to the server. The server
 *         validates each wrap, persists the new
 *         <c>GroupChannelKey</c> rows, and (if
 *         ClearOnRotation is set) wipes the channel's
 *         ciphertext history.</item>
 *   <item>Updates the local channel-key store with the
 *         freshly unwrapped key so subsequent
 *         encrypt / decrypt calls use the new
 *         version.</item>
 * </list>
 *
 * The function is idempotent and concurrent-safe in
 * the sense that two concurrent calls in the same
 * channel race on the server side — the second call
 * gets a 400 (the requested newKeyVersion is no
 * longer exactly currentMax+1) and surfaces as a
 * non-fatal warning. The watcher swallows that case
 * by re-fetching the channel metadata and continuing
 * with the now-fresh key.
 */

import * as openpgp from "openpgp";

import { api } from "@/lib/api";
import { useKeyStore } from "./keyStore";
import { useChannelKeyStore } from "./channelKey";

/**
 * The result of a rotation attempt. The watcher uses
 * this to decide whether to surface a toast ("rotated
 * successfully") or silently skip ("not yet due").
 */
export type RotationOutcome =
  | { kind: "not-due" }
  | { kind: "rotated"; newKeyVersion: number; deletedMessages: number }
  | { kind: "skipped"; reason: string };

/**
 * Attempt a rotation for the given channel. Returns
 * an outcome — never throws. Errors are mapped to
 * <c>{ kind: "skipped", reason }</c> so the caller's
 * useEffect doesn't need a try/catch.
 */
export async function maybeRotate(
  channelId: number,
): Promise<RotationOutcome> {
  try {
    // ---- 1. Is rotation due? ----------------------------------
    const channel = await api.e2ee.getChannel(channelId);
    if (new Date(channel.nextRotationUtc).getTime() > Date.now()) {
      return { kind: "not-due" };
    }

    // ---- 2. Make sure the user has a usable PGP key ----
    // We use the user's PGP key to wrap, but since
    // we're wrapping FOR the user too, the watcher's
    // user can also be the local user — the wrap
    // operation doesn't need the private key.
    const keyStore = useKeyStoreSafe();
    if (!keyStore?.unlocked) {
      return {
        kind: "skipped",
        reason: "PGP key not unlocked — rotation deferred.",
      };
    }
    const userId = keyStore.unlocked.fingerprint ? null : null; // not used here
    void userId;

    // ---- 3. Generate fresh AES-256 key ----------------------
    const newAesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true, // extractable so we can wrap each member
      ["encrypt", "decrypt"],
    );
    const rawAes = new Uint8Array(
      await crypto.subtle.exportKey("raw", newAesKey),
    );

    // ---- 4. Fetch all member public keys --------------------
    const memberKeys = await api.e2ee.listPublicKeys(channelId);
    if (memberKeys.length === 0) {
      return { kind: "skipped", reason: "Channel has no PGP members." };
    }

    // ---- 5. Compute the new version (current + 1) -------
    // The server validates this server-side, but
    // knowing the right value up-front lets us avoid a
    // round-trip on rejection.
    const myKey = await api.e2ee.getMyKey(channelId);
    const newKeyVersion = (myKey?.keyVersion ?? 0) + 1;

    // ---- 6. Wrap the AES key for each member --------------
    const wraps = await Promise.all(
      memberKeys.map(async (m) => {
        const pubKey = await openpgp.readKey({
          armoredKey: m.publicKeyArmored,
        });
        const encrypted = (await openpgp.encrypt({
          message: await openpgp.createMessage({
            binary: rawAes as Uint8Array,
          }),
          encryptionKeys: pubKey,
          format: "armored",
        })) as string;
        return { userId: m.userId, encryptedAesKey: encrypted };
      }),
    );

    // ---- 7. POST to the server -------------------------------
    const result = await api.e2ee.rotate(channelId, {
      newKeyVersion,
      wraps,
    });

    // ---- 8. Update the local key store with the new key.
    // The server has now stored wraps for everyone,
    // including us. We refresh our own entry so the
    // next ensureUnlocked() call returns the new
    // version.
    const channelKeys = useChannelKeyStoreSafe();
    if (channelKeys) {
      channelKeys.set(channelId, { key: newAesKey, version: newKeyVersion });
    }

    return {
      kind: "rotated",
      newKeyVersion: result.newKeyVersion,
      deletedMessages: result.deletedMessages,
    };
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Singleton accessors (same pattern as peerInvite.ts).
// We can't call React hooks from a non-hook function;
// the providers expose the live stores through
// module-level singletons that the function reads.
import { getKeyStoreInstance } from "./keyStore";
import { getChannelKeyStoreInstance } from "./channelKey";

function useKeyStoreSafe() {
  return getKeyStoreInstance();
}

function useChannelKeyStoreSafe() {
  return getChannelKeyStoreInstance();
}
