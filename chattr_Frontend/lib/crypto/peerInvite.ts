"use client";

import * as openpgp from "openpgp";

import { api } from "@/lib/api";
import { getKeyStoreInstance } from "./keyStore";
import { getChannelKeyStoreInstance } from "./channelKey";

/**
 * Add a user to an existing E2EE channel. The inviter
 * takes the current channel AES key from their local
 * RAM store, fetches the target user's PGP public key,
 * wraps the AES key with it, and POSTs to the server.
 *
 * The server independently validates the wrap is
 * addressed to the target user (PGP recipient key id
 * matches) before persisting — see
 * <c>ChannelKeyService.AddMemberAsync</c> on the
 * backend. So a bad wrap never reaches storage.
 *
 * This is a plain function (not a hook) so it can be
 * called from event handlers in components. It pulls
 * the live key + channel stores through the
 * module-level singletons that the providers maintain.
 */
export async function addMemberToChannel(opts: {
  channelId: number;
  targetUserId: number;
}): Promise<void> {
  const { channelId, targetUserId } = opts;

  const keyStore = getKeyStoreInstance();
  const channelKeys = getChannelKeyStoreInstance();

  if (!keyStore?.unlocked) {
    throw new Error(
      "Unlock your PGP key in Settings before inviting members.",
    );
  }
  const stored = channelKeys?.keys.get(channelId);
  if (!stored) {
    throw new Error(
      "Open the channel first so its key is loaded into RAM.",
    );
  }

  // Fetch the target user's PGP public key
  const peer = await api.e2ee.getUserKey(targetUserId);

  // Export our raw AES key (extractable=true)
  const rawAes = new Uint8Array(
    await crypto.subtle.exportKey("raw", stored.key),
  );

  // Wrap with the target user's PGP public key
  const publicKey = await openpgp.readKey({
    armoredKey: peer.publicKeyArmored,
  });
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: rawAes as Uint8Array }),
    encryptionKeys: publicKey,
    format: "armored",
  });

  // POST to the backend
  await api.e2ee.addMember(channelId, {
    userId: targetUserId,
    encryptedAesKey: encrypted as string,
    keyVersion: stored.version,
  });
}
