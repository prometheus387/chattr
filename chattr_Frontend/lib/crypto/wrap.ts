"use client";

/**
 * At-rest encryption for the user's PGP private key.
 *
 * Threat model: an attacker who reads the IndexedDB
 * (via XSS, malicious browser extension, or local file
 * access on a stolen laptop) can read the ciphertext
 * but cannot decrypt the private PGP key without the
 * user's passphrase. The "extractable: false" AES-GCM
 * key lives only inside the WebCrypto context for the
 * duration of one unwrap operation; the JS engine
 * cannot read it back as bytes.
 *
 * Algorithm choices (matches OWASP 2023 guidance):
 * <list type="bullet">
 *   <item>PBKDF2-SHA256, 600 000 iterations. Adjusts
 *         the cost as CPUs get faster; the value is
 *         meant to take ~250 ms on a mid-range
 *         laptop, which is the ceiling most
 *         consumers will tolerate for a login-style
 *         operation.</item>
 *   <item>AES-GCM-256, fresh 96-bit IV per wrap. The
 *         IV is stored alongside the ciphertext; the
 *         key is never written to disk.</item>
 *   <item>16-byte salt, randomly generated, stored
 *         alongside the wrapped blob. Prevents
 *         pre-computed rainbow tables from being
 *         useful against the IndexedDB dump.</item>
 * </list>
 */

const PBKDF2_ITERATIONS = 600_000;
const AES_KEY_LENGTH = 256; // bits
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12; // bytes — AES-GCM standard

/**
 * Bundle written to IndexedDB. All three byte arrays
 * (wrapped, salt, iv) are needed to reconstruct the
 * plaintext — losing any one makes decryption
 * impossible. We store them in a single object so
 * they're atomically written / deleted.
 */
export interface WrappedPrivateKey {
  /** base64-encoded ciphertext (= nonce ‖ ct ‖ tag
   *  under AES-GCM with the derived key + IV). */
  wrapped: string;
  /** base64-encoded salt used in PBKDF2. */
  salt: string;
  /** base64-encoded IV used in AES-GCM. */
  iv: string;
}

export interface StoredKeyEnvelope {
  /** What we wrote to IndexedDB. */
  wrapped: WrappedPrivateKey;
  /** The user's public key (armored PGP). Stored
   *  alongside so we don't need a second round-trip
   *  to recover it on app start. */
  publicKeyArmored: string;
  /** Stable identifier of the key — same value as
   *  the one the server stores on the User row. */
  fingerprint: string;
  /** When the key was first generated (ms since
   *  epoch). Displayed in the settings UI for
   *  "rotate every N months" hints. */
  createdAt: number;
}

// ---- base64 helpers ----------------------------------------------------
// The IndexedDB API accepts any structured-cloneable
// value, but storing raw Uint8Arrays in the envelope is
// awkward to inspect from the devtools. We base64-encode
// the binary blobs so the envelope is JSON-serialisable
// in case we ever want to back it up to a file.

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---- key derivation ----------------------------------------------------

/**
 * Derive a 256-bit AES-GCM key from the user's
 * passphrase + salt. The returned key is non-extractable
 * (the second arg to <c>deriveKey</c>) — once derived,
 * the key bytes are pinned inside the WebCrypto
 * context. We can use it to encrypt or decrypt, but
 * cannot read it back as a buffer.
 *
 * Iterations set at the OWASP-recommended 600 000 for
 * PBKDF2-SHA256. Tweak via the constant at the top of
 * this file if you want to dial cost up/down.
 */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase) as BufferSource,
    "PBKDF2",
    /* extractable */ false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    /* extractable */ false,
    ["encrypt", "decrypt"],
  );
}

// ---- public API --------------------------------------------------------

/**
 * Encrypt the armored PGP private key for at-rest
 * storage. Returns a self-contained envelope: salt + IV
 * + ciphertext, all base64-encoded. The user must enter
 * their passphrase to decrypt.
 */
export async function wrapPrivateKey(
  privateKeyArmored: string,
  passphrase: string,
): Promise<WrappedPrivateKey> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const plaintext = new TextEncoder().encode(privateKeyArmored);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );

  return {
    wrapped: toBase64(new Uint8Array(ciphertext)),
    salt: toBase64(salt),
    iv: toBase64(iv),
  };
}

/**
 * Reverse of <see cref="wrapPrivateKey"/>. Throws
 * OperationError when the passphrase is wrong (AES-GCM
 * authentication failure surfaces as a single
 * `OperationError` from the WebCrypto API; we re-throw
 * so the calling React code can render a "wrong
 * passphrase" toast).
 */
export async function unwrapPrivateKey(
  wrapped: WrappedPrivateKey,
  passphrase: string,
): Promise<string> {
  const salt = fromBase64(wrapped.salt);
  const iv = fromBase64(wrapped.iv);
  const ciphertext = fromBase64(wrapped.wrapped);
  const key = await deriveKey(passphrase, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}
