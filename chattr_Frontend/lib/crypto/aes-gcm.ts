"use client";

/**
 * AES-256-GCM helpers for the E2EE chat layer.
 *
 * The channel AES key lives in <c>channelKey.tsx</c>'s
 * store as a <c>CryptoKey</c> object. To send a
 * message, we encrypt the plaintext with that key
 * and a fresh 12-byte nonce, base64-encode
 * <c>nonce ‖ ciphertext ‖ tag</c>, and hand the blob
 * to the hub.
 *
 * To receive, we run the inverse: base64-decode, split
 * off the nonce, decrypt with the same key, render the
 * plaintext.
 *
 * The 12-byte nonce is generated per message via
 * <c>crypto.getRandomValues</c>. Uniqueness under the
 * same key is essential for AES-GCM security — a
 * reused nonce breaks both confidentiality and
 * authenticity. We never reuse: a fresh random
 * nonce is generated for every encrypt() call, and
 * the nonce is bound to the ciphertext in the
 * wire format so the recipient doesn't need a
 * separate lookup.
 *
 * Tag length is fixed at 128 bits (the AES-GCM
 * standard) and the AAD is empty — the KeyVersion
 * travels as a sibling field, not as AAD bytes, so
 * the wire format stays simple.
 */

const NONCE_LENGTH = 12; // bytes — AES-GCM standard
const TAG_LENGTH = 16; // bytes — AES-GCM standard

/** Standard base64 helpers. */
function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Encrypt a UTF-8 plaintext string with the supplied
 * AES-GCM key. Returns base64(<c>nonce ‖ ct ‖ tag</c>).
 */
export async function encryptMessage(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plaintextBytes as BufferSource,
    ),
  );
  // The webcrypto call returns ciphertext ‖ tag
  // concatenated. We want nonce ‖ ct ‖ tag on the
  // wire so the receiver can extract all three
  // pieces without knowing the lengths a-priori.
  const out = new Uint8Array(NONCE_LENGTH + ct.length);
  out.set(iv, 0);
  out.set(ct, NONCE_LENGTH);
  return bytesToBase64(out);
}

/**
 * Inverse of <see cref="encryptMessage"/>. Throws
 * <c>OperationError</c> on a tag-mismatch (wrong key,
 * tampered ciphertext, or wrong nonce).
 */
export async function decryptMessage(
  blob: string,
  key: CryptoKey,
): Promise<string> {
  const bytes = base64ToBytes(blob);
  if (bytes.length < NONCE_LENGTH + TAG_LENGTH)
  {
    throw new Error("Ciphertext too short to be a valid AES-GCM message.");
  }
  const iv = bytes.slice(0, NONCE_LENGTH);
  const ct = bytes.slice(NONCE_LENGTH);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

/**
 * Generate a fresh client-only message id. Used for
 * ephemeral channels where the server has no
 * persistence and the wire envelope needs a stable
 * dedupe key on the receiver side.
 */
export function newEphemeralId(): string {
  // crypto.randomUUID() is available in all modern
  // browsers and gives us a v4 UUID — collision-
  // resistant for any practical message rate.
  return (
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : // Fallback: 16 random bytes hex'd.
        Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
  );
}
