// Shared types between the chattr. frontend and the Chattr.Api backend.
// Keep these in sync with Chattr.Core.DTOs.* on the server.

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string; // ISO 8601
}

export interface AuthResponse {
  token: string;
  expiresAt: string; // ISO 8601
  user: PublicUser;
}

export interface UserLoginPayload {
  username: string;
  password: string;
}

export interface UserRegisterPayload {
  username: string;
  password: string;
  confirmPassword: string;
  securityQuestion: string;
  securityAnswer: string;
}

export interface UsernameAvailability {
  username: string;
  available: boolean;
}

/** Server-side summary of a guild invite. Returned by create / list. */
export interface GuildInvite {
  id: number;
  code: string;
  guildId: number;
  guildName: string;
  issuedById: number;
  issuedByUsername: string;
  createdAt: string;
  unlimitedUse: boolean;
  maxUse: number | null;
  useCount: number;
  validUntil: string | null;
  /** Server-computed: true iff the invite is no longer redeemable. */
  expired: boolean;
}

/**
 * What the /api/invites/{code} endpoint returns to a public viewer.
 * No token required, but if the caller is authenticated the
 * `alreadyMember` field tells them whether the accept button is even
 * relevant.
 */
export interface InvitePreview {
  code: string;
  guildId: number;
  guildName: string;
  guildIconUrl: string | null;
  memberCount: number;
  alreadyMember: boolean;
  expired: boolean;
}

/**
 * Detailed role view: the role's identity, presentation, and
 * permission flags. Returned by GET/POST/PATCH on
 * /api/guilds/{id}/roles. Sent as a single round-trip so the
 * settings UI can render a role table without N+1 calls.
 */
export interface Role {
  id: number;
  name: string;
  color: string;
  position: number;
  displaySeparately: boolean;
  iconSvg: string | null;
  permissions: RolePermissions;
}

export interface RolePermissions {
  isAdministrator: boolean;
  canManageRoles: boolean;
  canCreateInvite: boolean;
  canManageChannels: boolean;
  canDeleteMessages: boolean;
  canBanMembers: boolean;
  canKickMembers: boolean;
  canMuteMembers: boolean;
  canDeafenMembers: boolean;
  canTimeoutMembers: boolean;
  canChangeOwnNickname: boolean;
  canChangeNickName: boolean;
  bypassSlowmode: boolean;
}

/** Payload for PATCH /api/guilds/{id}/roles/{roleId}. */
export interface UpdateRolePayload {
  name?: string;
  color?: string;
  position?: number;
  displaySeparately?: boolean;
  iconSvg?: string | null;
  permissions?: RolePermissions;
}

/** Payload for POST /api/guilds/{id}/roles. */
export interface CreateRolePayload {
  name: string;
  color?: string;
  displaySeparately?: boolean;
  permissions?: RolePermissions;
}

/** Per-guild member. Mirrors GuildMemberDto on the server. */
export interface GuildMember {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleId: number;
  roleName: string;
  roleColor: string;
  roleIconSvg: string | null;
  isOwner: boolean;
  isAdministrator: boolean;
  joinedAt: string;
}

/** Platform-admin user listing (chattr-wide). */
export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  platformRole: string;
  createdAt: string;
  lastSeenAt: string | null;
}

/** Payload for PATCH /api/admin/users/{id}/role. */
export interface UpdatePlatformRolePayload {
  role: "User" | "Moderator" | "Council" | "Clique" | "Admin";
}

/** Dashboard stats shape. */
export interface AdminDashboard {
  totalUsers: number;
  totalGuilds: number;
  totalChannels: number;
  totalMessages: number;
  totalDirectMessages: number;
  activeUsersLast24h: number;
  roleDistribution: {
    admin: number;
    clique: number;
    council: number;
    moderator: number;
    user: number;
  };
  guildGrowthLast14Days: {
    daily: Array<{ date: string; count: number }>;
  };
}

/** Thrown by the api client when the backend returns a non-2xx response. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}
