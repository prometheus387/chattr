/**
 * Thin wrapper around the chattr. backend.
 *
 * The frontend always calls `/api/...` on its own origin. Next.js
 * proxies those requests to the .NET API server-side via the
 * `rewrites()` block in next.config.mjs, so the browser never makes
 * a cross-origin call and CORS is a non-issue.
 *
 * If you ever need to call the API directly (e.g. from a Node script),
 * set `API_BASE_URL` in `process.env` before importing this module.
 */
import {
  ApiError,
  type AdminDashboard,
  type AdminUser,
  type AuthResponse,
  type CreateRolePayload,
  type GuildInvite,
  type GuildMember,
  type InvitePreview,
  type PublicUser,
  type Role,
  type UpdatePlatformRolePayload,
  type UpdateRolePayload,
  type UserLoginPayload,
  type UserRegisterPayload,
  type UsernameAvailability,
} from "@/types/api";
import type {
  Channel,
  DmMessage,
  DmSummary,
  GuildSummary,
  Message,
  PresenceList,
} from "@/types/client";

// Override hook — lets non-browser callers (scripts, tests) point at a
// different base URL. In the browser, the rewrite proxy always wins.
const RUNTIME_BASE_URL =
  (typeof process !== "undefined" && process.env?.API_BASE_URL?.replace(/\/+$/, "")) ||
  "";

function resolveUrl(path: string): string {
  // If a runtime override is set, use it. Otherwise return the path as-is,
  // which the browser resolves against the current page's origin.
  return RUNTIME_BASE_URL ? `${RUNTIME_BASE_URL}${path}` : path;
}

type TokenProvider = () => string | null;

let _tokenProvider: TokenProvider = () => null;

/** The auth provider registers itself here so the api client can attach the JWT. */
export function setAuthTokenProvider(provider: TokenProvider): void {
  _tokenProvider = provider;
}

/**
 * Returns the current token, or null if the provider hasn't been registered
 * or has nothing to give us. Exposed mainly for debugging.
 */
export function getAuthToken(): string | null {
  return _tokenProvider();
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  /** When true, the Authorization header is NOT attached (used by signin/register). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, anonymous = false, signal } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (!anonymous) {
    const token = _tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(resolveUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  // 204 No Content — nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Backend may return plain text (e.g. validation messages).
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed === "string" && parsed.length > 0
        ? parsed
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, parsed);
  }

  return parsed as T;
}

export const api = {
  // --- Auth ----------------------------------------------------------------
  auth: {
    register: (payload: UserRegisterPayload) =>
      request<PublicUser>("/api/auth/register", {
        method: "POST",
        body: payload,
        anonymous: true,
      }),
    signIn: (payload: UserLoginPayload) =>
      request<AuthResponse>("/api/auth/signin", {
        method: "POST",
        body: payload,
        anonymous: true,
      }),
    me: () => request<PublicUser>("/api/auth/me"),
    usernameAvailable: (username: string) =>
      request<UsernameAvailability>(
        `/api/auth/username-free?username=${encodeURIComponent(username)}`,
        { anonymous: true },
      ),
  },

  // --- Users ---------------------------------------------------------------
  users: {
    list: () => request<PublicUser[]>("/api/users"),
    /** Look up a single user by their integer id. Returns null on 404. */
    getById: async (id: number): Promise<PublicUser | null> => {
      try {
        return await request<PublicUser>(`/api/users/${id}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    /**
     * Look up a single user by their username. Returns null on 404.
     * (Avoid `api.users.getById` with a username — that route is guid-typed.)
     */
    getByUsername: async (username: string): Promise<PublicUser | null> => {
      try {
        return await request<PublicUser>(
          `/api/users/by-username/${encodeURIComponent(username)}`,
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  },

  // --- Guilds / Channels / Messages ----------------------------------------
  guilds: {
    /** Guilds the current user is a member of. */
    list: () => request<GuildSummary[]>("/api/guilds"),
    /**
     * Create a new guild. The caller becomes its owner and the
     * server seeds #general + #announcements so it's not empty.
     */
    create: (name: string) =>
      request<GuildSummary>("/api/guilds", {
        method: "POST",
        body: { name },
      }),
    /**
     * Detail view of one guild, scoped to the requesting user. The
     * server only returns it if the user is a member.
     */
    get: (guildId: number) => request<GuildSummary>(`/api/guilds/${guildId}`),
    /**
     * Patch a guild's settings. Only fields you send are applied.
     * 200 on success, 403 if the caller is a member without admin
     * rights, 404 if they aren't a member at all.
     */
    update: (guildId: number, patch: { name?: string; iconUrl?: string | null }) =>
      request<GuildSummary>(`/api/guilds/${guildId}`, {
        method: "PATCH",
        body: patch,
      }),
    /** All channels in a guild, grouped client-side by category. */
    channels: (guildId: number) =>
      request<Channel[]>(`/api/guilds/${guildId}/channels`),
    /**
     * Leave a guild. Returns true on success, false if the server
     * returned 404 (already left) or 403 (not a member). Throws for
     * any other failure (401, 409, network, …).
     */
    leave: async (guildId: number): Promise<boolean> => {
      try {
        await request<void>(`/api/guilds/${guildId}/members/me`, {
          method: "DELETE",
        });
        return true;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          return false;
        }
        throw err;
      }
    },
  },

  // --- Guild members + roles (per-guild) -------------------------------
  guildMembers: {
    /**
     * Members of a guild with their role colour / icon. Drives
     * the user sidebar (which can group by role when the role
     * has DisplaySeparately=true). Available to any member.
     */
    list: (guildId: number) =>
      request<GuildMember[]>(`/api/guilds/${guildId}/members`),
    /**
     * Assign a role to a member. The actor's role must be above
     * the target role in the hierarchy (or the actor must be
     * the guild owner) — the server enforces this. 204 on
     * success, 403 if the actor lacks the privilege, 409 if
     * the target is a guild owner (owners can't be demoted
     * without a transfer-ownership flow).
     */
    assignRole: (guildId: number, userId: number, roleId: number) =>
      request<void>(`/api/guilds/${guildId}/members/${userId}/role`, {
        method: "PATCH",
        body: { roleId },
      }),
  },

  guildRoles: {
    /** All roles in a guild, sorted by position (admin-tier first). */
    list: (guildId: number) =>
      request<Role[]>(`/api/guilds/${guildId}/roles`),
    /** Create a new role. Owner / CanManageRoles only. */
    create: (guildId: number, payload: CreateRolePayload) =>
      request<Role>(`/api/guilds/${guildId}/roles`, {
        method: "POST",
        body: payload,
      }),
    /** Patch a role (name / colour / position / perms / icon). */
    update: (guildId: number, roleId: number, payload: UpdateRolePayload) =>
      request<Role>(`/api/guilds/${guildId}/roles/${roleId}`, {
        method: "PATCH",
        body: payload,
      }),
    /** Delete a role. 400 if @everyone; 409 if members still have it. */
    delete: (guildId: number, roleId: number) =>
      request<void>(`/api/guilds/${guildId}/roles/${roleId}`, {
        method: "DELETE",
      }),
  },

  // --- Platform admin (admin / moderator only) ------------------------
  admin: {
    /** Every user on the platform with their role. */
    users: () => request<AdminUser[]>("/api/admin/users"),
    /** Update a user's platform role. */
    updateUserRole: (userId: number, payload: UpdatePlatformRolePayload) =>
      request<AdminUser>(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: payload,
      }),
    /** Stats for the admin dashboard. */
    dashboard: () => request<AdminDashboard>("/api/admin/dashboard"),
  },

  // --- Guild invites -------------------------------------------------------
  guildInvites: {
    /** Create a fresh invite for a guild. Admin / CanCreateInvite only. */
    create: (guildId: number, opts: { unlimitedUse?: boolean; maxUse?: number; validUntil?: string | null } = {}) =>
      request<GuildInvite>(`/api/guilds/${guildId}/invites`, {
        method: "POST",
        body: opts,
      }),
    /** List invites for a guild. Admin only. */
    list: (guildId: number) =>
      request<GuildInvite[]>(`/api/guilds/${guildId}/invites`),
    /** Revoke (delete) an invite. Admin only. */
    revoke: (inviteId: number) =>
      request<void>(`/api/invites/${inviteId}`, { method: "DELETE" }),
  },

  // --- Public invite lookup / accept ---------------------------------------
  invites: {
    /**
     * Preview an invite by code. No auth required — but if the caller
     * IS authenticated, the request sends the bearer token and the
     * server fills in `alreadyMember` so the page can show the right
     * CTA. 404 if the code is unknown / revoked.
     */
    preview: (code: string) =>
      request<InvitePreview>(`/api/invites/${encodeURIComponent(code)}`),
    /**
     * Accept an invite. Joins the guild with @everyone. Idempotent:
     * if the caller is already a member, returns 200 with
     * `alreadyMember: true` and the use count is NOT bumped.
     */
    accept: (code: string) =>
      request<{ guildId: number; alreadyMember: boolean }>(
        `/api/invites/${encodeURIComponent(code)}/accept`,
        { method: "POST" },
      ),
  },
  channels: {
    /** Latest messages in a channel, ascending by id. */
    messages: (channelId: number, limit = 50) =>
      request<Message[]>(
        `/api/channels/${channelId}/messages?limit=${limit}`,
      ),
    /** Post a new message. The server stamps author + createdAt. */
    send: (channelId: number, content: string) =>
      request<Message>(`/api/channels/${channelId}/messages`, {
        method: "POST",
        body: { content },
      }),
  },

  // --- Presence ------------------------------------------------------------
  presence: {
    /**
     * Returns the user list. The server tells us via `showOffline` whether
     * we should render offline users too (true when totalAccounts < 1000).
     */
    list: () => request<PresenceList>("/api/presence/users"),
    /** Heartbeat: tell the server "I'm here right now". */
    heartbeat: () =>
      request<void>("/api/presence/heartbeat", { method: "POST" }),
  },

  // --- Direct messages -----------------------------------------------------
  dms: {
    /** Recent DM channels for the current user, sorted by activity. */
    list: () => request<DmSummary[]>("/api/dms"),
    /**
     * Get-or-create a DM with another user. Idempotent. Returns the
     * channel id; the caller can then load its messages.
     */
    openWith: async (otherUserId: number): Promise<number> => {
      const r = await request<{ id: number }>(`/api/dms/with/${otherUserId}`, {
        method: "POST",
      });
      return r.id;
    },
    messages: (dmId: number, limit = 50) =>
      request<DmMessage[]>(`/api/dms/${dmId}/messages?limit=${limit}`),
    send: (dmId: number, content: string) =>
      request<DmMessage>(`/api/dms/${dmId}/messages`, {
        method: "POST",
        body: { content },
      }),
  },
};
