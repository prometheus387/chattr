/**
 * E2EE-specific API methods. These map to the
 * <c>/api/e2ee/...</c> routes the Phase-2 backend
 * exposes. The Phase-2 spec covers:
 * <list type="bullet">
 *   <item>Per-user PGP public-key upload + lookup.</item>
 *   <item>Channel metadata (name, ClearOnRotation, …).</item>
 *   <item>Channel member list + my-channel-key fetch.</item>
 *   <item>Add-Member (with PGP-encrypted wrap validation).</item>
 *   <item>Rotate (fresh AES key, wraps for every member).</item>
 *   <item>Public-keys list (used by the rotation flow).</item>
 * </list>
 *
 * Most types live in the <c>types/e2ee.d.ts</c>
 * definition; the request/response shapes mirror the
 * server's DTOs 1:1 so a wire-shape mismatch surfaces
 * as a TypeScript error at compile time.
 */

import { apiRequest } from "./client";

export const e2ee = {
  // ---- PGP public-key management --------------------------------

  /** Upload / replace the caller's PGP public key. */
  uploadMyPublicKey: (publicKeyArmored: string, fingerprint: string) =>
    apiRequest<{ fingerprint: string }>("/api/users/me/pgp-key", {
      method: "PUT",
      body: { publicKeyArmored, fingerprint },
    }),

  /** Fetch the caller's own public key. */
  getMyPublicKey: () =>
    apiRequest<{
      userId: number;
      publicKeyArmored: string;
      fingerprint: string;
      uploadedAt: string;
    }>("/api/users/me/pgp-key"),

  /** Fetch a peer's public key by user id. */
  getUserPublicKey: (userId: number) =>
    apiRequest<{
      userId: number;
      publicKeyArmored: string;
      fingerprint: string;
      uploadedAt: string;
    }>(`/api/users/${userId}/pgp-key`),

  // ---- Channel metadata ------------------------------------------

  /** Channel detail (name, ClearOnRotation, etc.). */
  getChannel: (channelId: number) =>
    apiRequest<{
      id: number;
      name: string;
      isEphemeral: boolean;
      rotationInterval: string;
      nextRotationUtc: string;
      clearOnRotation: boolean;
      createdByUserId: number;
      createdAt: string;
      isCreator: boolean;
    }>(`/api/e2ee/channels/${channelId}`),

  /** Update the channel. Phase 2 supports
   *  <c>clearOnRotation</c> + <c>rotationInterval</c>
   *  only; the server ignores unknown fields. */
  updateChannel: (
    channelId: number,
    patch: { clearOnRotation?: boolean; rotationInterval?: string },
  ) =>
    apiRequest<{
      id: number;
      clearOnRotation: boolean;
      rotationInterval: string;
      nextRotationUtc: string;
    }>(`/api/e2ee/channels/${channelId}`, {
      method: "PATCH",
      body: patch,
    }),

  // ---- Member + key flows ----------------------------------------

  /** List the channel's current members (id, username,
   *  displayName, joinedAt, hasPgpKey). */
  listMembers: (channelId: number) =>
    apiRequest<
      {
        userId: number;
        username: string;
        displayName: string;
        joinedAt: string;
        hasPgpKey: boolean;
      }[]
    >(`/api/e2ee/channels/${channelId}/members`),

  /**
   * Add a user to the channel. <c>encryptedAesKey</c>
   * is the channel's AES key wrapped with the target
   * user's PGP public key; the server validates the
   * wrap is addressed to the target before persisting.
   */
  addMember: (
    channelId: number,
    body: { userId: number; keyVersion: number; encryptedAesKey: string },
  ) =>
    apiRequest<{ id: number; keyVersion: number; createdAt: string }>(
      `/api/e2ee/channels/${channelId}/members`,
      { method: "POST", body },
    ),

  /** Caller's most-recently-stored wrapped key for
   *  this channel. The client unwraps it locally with
   *  the user's PGP private key. */
  getMyKey: (channelId: number) =>
    apiRequest<{
      keyVersion: number;
      encryptedAesKey: string;
      createdAt: string;
    }>(`/api/e2ee/channels/${channelId}/my-key`),

  /** All members' PGP public keys. Used by the
   *  rotation flow to wrap a new AES key for every
   *  member in one round-trip. */
  listPublicKeys: (channelId: number) =>
    apiRequest<
      {
        userId: number;
        publicKeyArmored: string;
        fingerprint: string;
      }[]
    >(`/api/e2ee/channels/${channelId}/public-keys`),

  /**
   * Rotate the channel's AES key. <c>newKeyVersion</c>
   * must be exactly <c>currentMax + 1</c> (the server
   * returns 400 otherwise). The server validates each
   * wrap is addressed to the right user and (if the
   * channel has ClearOnRotation set) wipes the
   * channel's ciphertext history as part of the same
   * transaction.
   */
  rotate: (
    channelId: number,
    body: {
      newKeyVersion: number;
      wraps: { userId: number; encryptedAesKey: string }[];
    },
  ) =>
    apiRequest<{
      newKeyVersion: number;
      newNextRotationUtc: string;
      deletedMessages: number;
      clearedOnRotation: boolean;
    }>(`/api/e2ee/channels/${channelId}/rotate`, {
      method: "POST",
      body,
    }),
};
