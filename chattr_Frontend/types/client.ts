// --- Client-page types — guilds, channels, messages, presence. ---
// Keep in sync with Chattr.Core.DTOs.* on the server.

import type {
  AdminDashboard,
  AdminUser,
  GuildInvite as GuildInviteApi,
  InvitePreview as InvitePreviewApi,
  Role as RoleApi,
  UpdatePlatformRolePayload,
} from "@/types/api";

export type {
  AdminDashboard,
  AdminUser,
  GuildInviteApi,
  InvitePreviewApi,
  RoleApi,
  UpdatePlatformRolePayload,
};

// Re-export the server-driven types under their short client-side
// aliases so the components can import them from one place.
export type Role = RoleApi;
export type GuildInvite = GuildInviteApi;
export type InvitePreview = InvitePreviewApi;

export interface GuildSummary {
  id: number;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  isOwner: boolean;
  isAdministrator: boolean;
}

export type ChannelKind = "Text" | "Voice";

export interface Channel {
  id: number;
  guildId: number;
  name: string;
  category: string | null;
  kind: ChannelKind;
  position: number;
}

export interface Message {
  id: number;
  channelId: number;
  authorId: number;
  authorName: string;
  /**
   * Author's per-guild role colour. Drives the username tint in
   * the message row. Empty string = no custom colour, the
   * client falls back to the default text colour.
   */
  authorRoleColor: string;
  /**
   * Author's per-guild role icon. Sanitized server-side (see
   * Chattr.Infrastructure.Services.SvgSanitizer) so the client
   * can render it via dangerouslySetInnerHTML without a second
   * sanitization pass. Null = no icon.
   */
  authorRoleIconSvg: string | null;
  /** Author's role id in this guild; null when the author has left. */
  authorRoleId: number | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
}

/**
 * Per-guild member. Mirrors the GuildMemberDto on the server.
 * Used for the user sidebar (grouped by role when
 * DisplaySeparately is true) and the members list in the future
 * settings UI.
 */
export interface GuildMember {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleId: number;
  roleName: string;
  roleColor: string;
  /** Sanitized inline-SVG icon for the member's role. */
  roleIconSvg: string | null;
  isOwner: boolean;
  isAdministrator: boolean;
  joinedAt: string;
}

export interface UserPresence {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
}

export interface PresenceList {
  totalAccounts: number;
  /** True iff `totalAccounts < 1000`. Drives the offline-toggle in the UI. */
  showOffline: boolean;
  users: UserPresence[];
}

export interface DmSummary {
  id: number;
  otherUserId: number;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarUrl: string | null;
  otherLastSeenAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export interface DmMessage {
  id: number;
  dmChannelId: number;
  authorId: number;
  authorName: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
}
