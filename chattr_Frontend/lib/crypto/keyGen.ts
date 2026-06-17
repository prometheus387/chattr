"use client";

import * as openpgp from "openpgp";

/**
 * The shape of a freshly-generated (or imported) PGP key
 * pair, as it lives in the client's key store.
 *
 * The server only ever sees `publicKeyArmored` (uploaded
 * once at sign-up so it can wrap channel AES keys for
 * us). The `privateKeyArmored` form stays in the
 * browser's IndexedDB, AES-GCM-encrypted with a
 * passphrase-derived key; we only ever hold the *parsed*
 * PGP key in volatile RAM after the user unlocks it.
 */
export interface KeyPairBundle {
  /** ASCII-armored PGP PUBLIC key block. */
  publicKeyArmored: string;
  /** ASCII-armored PGP PRIVATE key block (still encrypted
   *  with the user's passphrase by openpgp itself; we
   *  re-encrypt at rest with our own AES-GCM). */
  privateKeyArmored: string;
  /** Uppercase hex fingerprint — the stable identifier
   *  for this key. Used in the UI to show "this is the
   *  same key you generated on device X". */
  fingerprint: string;
  /** Wall-clock creation time, ms since epoch. */
  createdAt: number;
}

/**
 * Generate a fresh PGP key pair for a user.
 *
 * Curve choice: Curve25519 (ed25519 for signing,
 * x25519 for encryption). The conventional "ECC"
 * option in openpgp.js. Rationale:
 * <list type="bullet">
 *   <item>~256-bit security level, matching AES-256.</item>
 *   <item>Smaller keys than RSA (32 bytes public, 32
 *         bytes private) — important because we wrap
 *         the channel AES key with this PGP key and
 *         that wrapping result lives in our DB row
 *         per-user per-channel.</item>
 *   <item>Faster than RSA at the same security level,
 *         both for keygen and for the per-message
 *         unwrap we'll do client-side.</item>
 * </list>
 *
 * The `passphrase` here is openpgp's *internal*
 * passphrase — used to symmetrically encrypt the
 * private key in the armored output. We don't store
 * this passphrase; the user picks it. On the client
 * we additionally re-encrypt the armored private key
 * with a different AES-GCM key derived from the same
 * passphrase (see <c>wrap.ts</c>); that's a defence-in-
 * depth measure so an attacker who steals the IndexedDB
 * blob still needs the passphrase to decrypt, on top
 * of needing the IndexedDB itself.
 */
export async function generatePgpKeyPair(opts: {
  userId: string;
  passphrase: string;
}): Promise<KeyPairBundle> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519",
    userIDs: [{ name: opts.userId, email: `${opts.userId}@chattr.local` }],
    passphrase: opts.passphrase,
    format: "armored",
  });

  const fingerprint = await openpgp.getFingerprint({ key: publicKey });

  return {
    publicKeyArmored: publicKey,
    privateKeyArmored: privateKey,
    fingerprint,
    createdAt: Date.now(),
  };
}

/**
 * Decrypt the user's private PGP key with their
 * passphrase and return the parsed openpgp key. The
 * caller is expected to either:
 * <list type="bullet">
 *   <item>Use the key in volatile RAM and let the JS
 *         GC drop it on idle, or</item>
 *   <item>Wipe the returned key explicitly with
 *         <c>(key as any).clearPrivateParams?.()</c> —
 *         openpgp.js doesn't currently expose a stable
 *         "destroy" method, but the GC will collect
 *         it once the React state holding it
 *         unmounts.</item>
 * </list>
 */
export async function unlockPrivateKey(
  privateKeyArmored: string,
  passphrase: string,
): Promise<openpgp.PrivateKey> {
  return (await openpgp.decryptKey({
    privateKey: privateKeyArmored,
    passphrase,
  })) as openpgp.PrivateKey;
}

/**
 * Re-encrypt the private key with a fresh passphrase
 * (e.g. the user is changing it). Same algorithm as
 * <c>generatePgpKeyPair</c> + the at-rest wrap; we just
 * skip the keygen and reuse the existing material.
 */
export async function reencryptPrivateKey(
  privateKeyArmored: string,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<string> {
  const key = await openpgp.decryptKey({
    privateKey: privateKeyArmored,
    passphrase: oldPassphrase,
  });
  return (await openpgp.encryptKey({
    privateKey: key,
    passphrase: newPassphrase,
  })) as string;
}
