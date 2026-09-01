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
import { decryptMessage, encryptMessage } from "./aes-gcm";

/**
 * The result of a rotation attempt. The watcher uses
 * this to decide whether to surface a toast ("rotated
 * successfully") or silently skip ("not yet due").
 */
export type RotationOutcome =
  | { kind: "not-due" }
  | {
      kind: "rotated";
      newKeyVersion: number;
      deletedMessages: number;
      reencryptedMessages: number;
    }
  | { kind: "skipped"; reason: string };

export type RotationMode = "delete" | "reencrypt";
export type RotationProgress =
  | { phase: "loading"; completed: number; total: number }
  | { phase: "reencrypting"; completed: number; total: number }
  | { phase: "uploading"; completed: number; total: number };

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

    return rotateChannelKey(
      channelId,
      channel.clearOnRotation ? "delete" : "reencrypt",
    );
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Force a manual key rotation. All cryptographic work happens locally. */
export async function rotateChannelKey(
  channelId: number,
  mode: RotationMode,
  onProgress?: (progress: RotationProgress) => void,
): Promise<RotationOutcome> {
  try {
    const keyStore = getKeyStoreInstance();
    if (mode === "reencrypt" && !keyStore?.unlocked) {
      return {
        kind: "skipped",
        reason: "Unlock your PGP key before re-encrypting message history.",
      };
    }

    // ---- 1. Generate fresh AES-256 key ----------------------
    const newAesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true, // extractable so we can wrap each member
      ["encrypt", "decrypt"],
    );
    const rawAes = new Uint8Array(
      await crypto.subtle.exportKey("raw", newAesKey),
    );

    // ---- 2. Fetch all member public keys --------------------
    const memberKeys = await api.e2ee.listPublicKeys(channelId);
    if (memberKeys.length === 0) {
      return { kind: "skipped", reason: "Channel has no PGP members." };
    }

    // ---- 3. Compute the new version (current + 1) -------
    // The server validates this server-side, but
    // knowing the right value up-front lets us avoid a
    // round-trip on rejection.
    const myKey = await api.e2ee.getMyKey(channelId);
    const newKeyVersion = (myKey?.keyVersion ?? 0) + 1;

    // ---- 4. Wrap the AES key for each member --------------
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

    // ---- 5. Re-encrypt persisted history locally -----------
    const reencryptedMessages: { messageId: number; ciphertext: string }[] = [];
    if (mode === "reencrypt") {
      const history = await fetchCompleteHistory(channelId, onProgress);
      const oldKeys = new Map<number, CryptoKey>();
      const privateKey = keyStore!.unlocked!.privateKey;

      for (let index = 0; index < history.length; index++) {
        const message = history[index]!;
        let oldKey = oldKeys.get(message.keyVersion);
        if (!oldKey) {
          const wrapped = await api.e2ee.getMyKey(
            channelId,
            message.keyVersion,
          );
          oldKey = await unwrapAesKey(wrapped.encryptedAesKey, privateKey);
          oldKeys.set(message.keyVersion, oldKey);
        }
        const plaintext = await decryptMessage(message.ciphertext, oldKey);
        const ciphertext = await encryptMessage(plaintext, newAesKey);
        reencryptedMessages.push({ messageId: message.id, ciphertext });
        onProgress?.({
          phase: "reencrypting",
          completed: index + 1,
          total: history.length,
        });
      }
    }

    // ---- 6. Commit wraps and history in one server transaction
    onProgress?.({
      phase: "uploading",
      completed: 0,
      total: reencryptedMessages.length,
    });
    const result = await api.e2ee.rotate(channelId, {
      newKeyVersion,
      mode,
      wraps,
      reencryptedMessages,
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
      reencryptedMessages: result.reencryptedMessages,
    };
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

type HistoryMessage = Awaited<ReturnType<typeof api.e2ee.getMessages>>[number];

async function fetchCompleteHistory(
  channelId: number,
  onProgress?: (progress: RotationProgress) => void,
): Promise<HistoryMessage[]> {
  const all: HistoryMessage[] = [];
  let before: number | undefined;
  while (true) {
    const page = await api.e2ee.getMessages(channelId, 200, before);
    if (page.length === 0) break;
    all.unshift(...page);
    onProgress?.({ phase: "loading", completed: all.length, total: all.length });
    if (page.length < 200) break;
    before = page[0]!.id;
  }
  return all;
}

async function unwrapAesKey(
  encryptedAesKey: string,
  privateKey: openpgp.PrivateKey,
): Promise<CryptoKey> {
  const message = await openpgp.readMessage({ armoredMessage: encryptedAesKey });
  const { data } = await openpgp.decrypt({
    message,
    decryptionKeys: privateKey,
    format: "binary",
  });
  return crypto.subtle.importKey(
    "raw",
    data as BufferSource,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// Singleton accessors (same pattern as peerInvite.ts).
// We can't call React hooks from a non-hook function;
// the providers expose the live stores through
// module-level singletons that the function reads.
import { getKeyStoreInstance } from "./keyStore";
import { getChannelKeyStoreInstance } from "./channelKey";

function useChannelKeyStoreSafe() {
  return getChannelKeyStoreInstance();
}
