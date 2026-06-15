// Client-page types — guilds, channels, messages, presence.
// Keep in sync with Chattr.Core.DTOs.* on the server.

export interface GuildSummary {
  id: number;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  isOwner: boolean;
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
  content: string;
  createdAt: string;
  editedAt: string | null;
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
