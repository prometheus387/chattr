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
  /**
   * True when the guild is in the archived state. Owners
   * see this banner in the Owner tab and the guild
   * header; non-owners can't access the guild at all
   * when it's archived, so they don't render this
   * field.
   */
  isArchived: boolean;
  /**
   * True iff the current user has a role with IsAdministrator on
   * this guild (or is the owner). Drives the Overview tab in the
   * settings modal — only admins / owners can rename the guild.
   */
  isAdministrator: boolean;
  /**
   * True iff the current user can create / edit / delete channels
   * here. Set when the user's role has IsAdministrator OR
   * CanManageChannels. Drives the Channels tab visibility.
   */
  canManageChannels: boolean;
  /**
   * True iff the current user can manage roles / members here.
   * Set when the user's role has IsAdministrator OR
   * CanManageRoles. Drives the Roles + Members tab visibility.
   */
  canManageRoles: boolean;
  /**
   * True iff the current user can kick other members. Surfaces
   * the "Kick" entry in the member right-click menu. Same gate
   * logic on the server — see `GuildPermissionService.CanKick*`.
   */
  canKickMembers: boolean;
  /**
   * True iff the current user can ban other members. Surfaces
   * the "Ban" entry in the member right-click menu.
   */
  canBanMembers: boolean;
  /**
   * True iff the current user can create invite links for the
   * guild. Enables the "Invite people" entry in the guild
   * header dropdown.
   */
  canCreateInvite: boolean;
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
  /** Soft-delete timestamp. Non-null + isDeleted=true renders a placeholder. */
  deletedAt: string | null;
  isDeleted: boolean;
  /** Server-computed: can the calling user edit this message? */
  canEdit: boolean;
  /** Server-computed: can the calling user delete this message? */
  canDelete: boolean;
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
