"use client";

/**
 * IndexedDB-backed key store.
 *
 * The actual storage is a single object stored under a
 * fixed key. We chose a flat key-value approach over a
 * structured store because we have exactly one key per
 * user (the device-local PGP identity) — there's no
 * schema to evolve, no indexes to maintain, no
 * migrations. If you ever need multiple keys per user
 * (e.g. a recovery key + the daily key), graduate to
 * <c>idb-keyval</c>'s `createStore` with a typed
 * schema.
 *
 * Privacy:
 * <list type="bullet">
 *   <item>What we store is the *wrapped* PGP key
 *         (AES-GCM ciphertext). The IndexedDB
 *         contents are useless to a thief who doesn't
 *         also have the passphrase.</item>
 *   <item>We never write the *plaintext* private key
 *         to disk. Even as a side-effect of a bug, the
 *         at-rest path goes through <c>wrapPrivateKey</c>.</item>
/// </list>
 */

import { get, set, del, createStore } from "idb-keyval";
import type { StoredKeyEnvelope } from "./wrap";

/**
 * We use a private store (rather than the default
 * <c>idb-keyval</c> store) so the database name is
 * specific to chattr — reduces collision risk with
 * other apps using the same browser profile.
 */
const store = createStore("chattr-secrets-db", "pgp");

const KEY_KEY = "primary";

export async function storeKey(envelope: StoredKeyEnvelope): Promise<void> {
  await set(KEY_KEY, envelope, store);
}

export async function loadKey(): Promise<StoredKeyEnvelope | undefined> {
  return get<StoredKeyEnvelope>(KEY_KEY, store);
}

export async function clearKey(): Promise<void> {
  await del(KEY_KEY, store);
}
