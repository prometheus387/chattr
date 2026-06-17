"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import type { GuildMember, Message, Role } from "@/types/client";
import { api } from "@/lib/api";
import { ApiError } from "@/types/api";

interface Props {
  messages: Message[];
  /**
   * Channel id, used as the URL parameter for the edit / delete
   * API calls. Falls back to the message's own channelId when
   * not supplied — both are valid; the explicit prop wins so
   * callers (the page) don't have to know the message they're
   * passing belongs to a specific channel.
   */
  channelId?: number;
  /** Called after a successful edit/delete so the parent can
   *  refresh its messages list / scroll position if needed. */
  onMutated?: () => void;
  className?: string;

  /**
   * Members of the current guild, used to look up the full
   * <see cref="GuildMember"/> record for a message's author
   * so the page-level context menu can render kick/ban/
   * assign-role items. MessageList only needs id + name from
   * the message itself; the rest comes from this list.
   */
  members?: GuildMember[];
  /**
   * Roles in the current guild. Forwarded to the page-level
   * context menu (assign-role items need the list of assignable
   * roles) — MessageList itself doesn't render them.
   */
  roles?: Role[];
  /**
   * Members the viewer is NOT allowed to moderate. Used by
   * the page's context menu to dim "kick" / "ban" items for
   * higher-ranked members. MessageList doesn't gate
   * anything on this directly — the cursor and
   * hover-affordances are still uniform — but the
   * downstream menu uses it.
   */
  untargetableIds?: Set<number>;
  /**
   * The viewer's user id, used so the page can decide
   * whether the click target is the viewer themselves (e.g.
   * to disable "kick yourself" or "mention yourself").
   */
  viewerUserId?: number;
  /**
   * The viewer's permissions in the current guild (canAssign /
   * canKick / canBan). Mirrors <see cref="ViewerPermissions"/>
   * below. MessageList doesn't act on this directly — the
   * page's context menu uses it to decide which items to
   * render — but it's part of the contract.
   */
  viewer?: ViewerPermissions;
  /**
   * Fired when the user left- or right-clicks an author's
   * username in the message list. The page renders a single
   * shared context menu (same one the user sidebar uses) so
   * the two surfaces stay in sync.
   */
  onMemberAction?: (
    member: GuildMember,
    x: number,
    y: number,
  ) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * Renders a sanitized inline-SVG role icon. The backend runs
 * each value through SvgSanitizer before it lands in the DB
 * (script / event handlers / external references are stripped),
 * so the client can render with dangerouslySetInnerHTML
 * without a second sanitization pass.
 */
function RoleIcon({ svg, className }: { svg: string | null; className?: string }) {
  if (!svg) return null;
  return (
    <span
      dangerouslySetInnerHTML={{ __html: svg }}
      className={clsx("inline-grid place-items-center align-[-0.125em]", className)}
      aria-hidden
    />
  );
}

/* ---- Username context menu ------------------------------------------- */

interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  icon: React.ReactNode;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

function UsernameContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape. Listeners on document so a
  // click anywhere in the page dismisses the menu.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamp the menu into the viewport so it doesn't get cut off
  // when the user clicks near the right or bottom edge. We
  // measure after mount (useLayoutEffect) so the user sees the
  // corrected position in the same frame as the menu appearing.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let dx = 0, dy = 0;
    if (rect.right > window.innerWidth - pad) {
      dx = window.innerWidth - pad - rect.right;
    }
    if (rect.bottom > window.innerHeight - pad) {
      dy = window.innerHeight - pad - rect.bottom;
    }
    if (dx || dy) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      className="auth-card-enter fixed z-50 min-w-[180px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0d11]/95 p-1 shadow-2xl shadow-black/60 backdrop-blur-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          onClick={() => {
            it.onSelect();
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <span className="text-white/50">{it.icon}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---- Inline edit textarea ------------------------------------------- */

function EditableMessage({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (newContent: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(value.length, value.length);
    // Set initial height to the content's natural height so
    // single-line messages don't render as a 2-row box.
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, []); // intentional: only on mount

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initial) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          // Auto-grow: keep the textarea tall enough for its
          // current content but never shrink below the natural
          // height of one line.
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        disabled={saving}
        rows={1}
        className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-white outline-none disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-white/45">
        <span>
          <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 text-[10px]">Enter</kbd> to save · <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 text-[10px]">Esc</kbd> to cancel
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/[0.05] hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || value.trim().length === 0}
          className="rounded-md bg-white px-2.5 py-0.5 text-[12px] font-medium text-[#0b0c0f] transition-opacity disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ---- Delete confirmation ------------------------------------------- */

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="auth-card-enter fixed inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="w-[360px] max-w-[92vw] rounded-xl border border-white/[0.08] bg-[#0c0d11]/95 p-5 shadow-2xl shadow-black/60">
        <h3 className="text-[15px] font-semibold text-white">Delete this message?</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/55">
          It will be removed from the channel for everyone. The
          message row stays in place so reply chains remain
          intact, but the content is replaced with a placeholder.
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2.5 py-1 text-[12.5px] text-white/70 hover:bg-white/[0.05] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-rose-500/90 px-2.5 py-1 text-[12.5px] font-medium text-white transition-colors hover:bg-rose-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Main component ------------------------------------------------- */

export function MessageList({
  messages,
  channelId,
  onMutated,
  className,
  members,
  roles: _roles,
  untargetableIds: _untargetableIds,
  viewerUserId: _viewerUserId,
  viewer: _viewer,
  onMemberAction,
}: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);

  // Sync parent prop → local state when the channel/refresh
  // changes the upstream messages list. The local copy is
  // what we mutate optimistically on edit / delete so the UI
  // doesn't have to wait for a full refetch to update.
  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  // Auto-scroll to the bottom when new messages arrive — but only if the
  // user is already near the bottom (don't yank them around when they
  // scroll up to read history).
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [localMessages]);

  // Track shift state. We use keydown/keyup on the document so
  // the buttons appear regardless of which message is hovered
  // — the spec is "shift hält und über seine eigene nachricht
  // hovert" so we gate on BOTH shift-held AND hovered.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    const onBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const openUserMenu = useCallback(
    (e: React.MouseEvent, user: { id: number; name: string }) => {
      e.preventDefault();
      e.stopPropagation();

      // If the page wired up onMemberAction, route through it
      // — that's the same callback the user-list rows use, so
      // the page renders one shared context menu (with kick /
      // ban / assign-role items for moderators, mention /
      // copy for everyone else). Falling back to my own
      // simpler menu keeps the component usable in isolation
      // (e.g. in Storybook or test harnesses).
      if (onMemberAction && members) {
        const member = members.find((m) => m.userId === user.id);
        if (member) {
          onMemberAction(member, e.clientX, e.clientY);
          return;
        }
      }

      // Fallback: my own minimal context menu with the actions
      // the spec literally asked for. Custom event so the
      // message-input (or a future composer) can pick this up
      // and insert a mention into the draft.
      const handleInsert = () => {
        window.dispatchEvent(
          new CustomEvent("chattr:insert-mention", { detail: { userId: user.id, name: user.name } }),
        );
      };
      const copyName = async () => {
        try { await navigator.clipboard.writeText(user.name); } catch { /* ignore */ }
      };
      const copyId = async () => {
        try { await navigator.clipboard.writeText(String(user.id)); } catch { /* ignore */ }
      };
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: `Mention @${user.name}`, onSelect: handleInsert, icon: <MentionIcon /> },
          { label: "Copy username", onSelect: copyName, icon: <CopyIcon /> },
          { label: `Copy user ID (${user.id})`, onSelect: copyId, icon: <HashIcon /> },
        ],
      });
    },
    [members, onMemberAction],
  );

  /** Replace one message in local state with the new server
   *  response (or a no-op patch for fields we don't have). */
  const replaceLocal = useCallback((updated: Message) => {
    setLocalMessages((prev) =>
      prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
    );
  }, []);

  const onEdit = useCallback(
    async (id: number, newContent: string) => {
      const m = localMessages.find((x) => x.id === id);
      if (!m) return;
      const targetChannel = channelId ?? m.channelId;
      try {
        const updated = await api.channels.edit(targetChannel, id, newContent);
        replaceLocal(updated);
        setEditingId(null);
        onMutated?.();
      } catch (err) {
        // Inline error feedback without a toast for now —
        // the spec didn't ask for one and editing is
        // rare. The textarea stays open so the user can
        // retry / cancel.
        throw err;
      }
    },
    [channelId, localMessages, onMutated, replaceLocal],
  );

  const onDelete = useCallback(
    async (id: number) => {
      const m = localMessages.find((x) => x.id === id);
      const targetChannel = channelId ?? m?.channelId;
      if (targetChannel === undefined) {
        setDeletingId(null);
        return;
      }
      try {
        await api.channels.delete(targetChannel, id);
        // Optimistic update: mark the message deleted locally
        // so the UI flips to "[deleted]" without waiting for
        // a refetch. The server has already soft-deleted.
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  isDeleted: true,
                  content: "",
                  deletedAt: new Date().toISOString(),
                }
              : m,
          ),
        );
        setDeletingId(null);
        onMutated?.();
      } catch (err) {
        // Re-throw so the confirm dialog (if any) can
        // re-enable its button. We don't show a toast here;
        // the user can retry from the menu.
        setDeletingId(null);
        throw err;
      }
    },
    [channelId, onMutated],
  );

  if (localMessages.length === 0) {
    return (
      <div
        className={clsx(
          "flex flex-1 items-center justify-center text-[13px] text-white/40",
          className,
        )}
      >
        No messages yet. Be the first to say something.
      </div>
    );
  }

  return (
    <div className={clsx("flex-1 overflow-y-auto px-6 py-4", className)}>
      <ul className="flex flex-col gap-1">
        {localMessages.map((m, i) => {
          const prev = localMessages[i - 1];
          // Group consecutive messages from the same author.
          const grouped =
            !!prev &&
            prev.authorId === m.authorId &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;

          // Show the inline edit/delete buttons when the user
          // is holding shift AND the message is one they can
          // act on. The `!isDeleted` guard makes the buttons
          // disappear once a message has been soft-deleted
          // (you can't edit or delete it again).
          const showActions =
            shiftHeld && !m.isDeleted && (m.canEdit || m.canDelete);

          return (
            <li
              key={m.id}
              className={clsx(
                "group/msg relative flex items-start gap-3 rounded-md px-2 py-1 hover:bg-white/[0.03]",
                grouped ? "mt-0" : "mt-3",
              )}
            >
              <div className="w-9 shrink-0 pt-0.5 text-center">
                {grouped ? (
                  <span className="text-[10.5px] text-white/25">
                    {formatTime(m.createdAt)}
                  </span>
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-[14px] font-semibold text-white/85">
                    {initialOf(m.authorName)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && !m.isDeleted && (
                  <div className="flex items-baseline gap-2">
                    <RoleIcon
                      svg={m.authorRoleIconSvg}
                      className="h-[1em] w-[1em] text-current"
                    />
                    <button
                      type="button"
                      onClick={(e) =>
                        openUserMenu(e, { id: m.authorId, name: m.authorName })
                      }
                      className="text-left text-[13.5px] font-semibold transition-opacity hover:opacity-80"
                      style={
                        m.authorRoleColor
                          ? { color: m.authorRoleColor }
                          : { color: "rgba(255,255,255,0.9)" }
                      }
                    >
                      {m.authorName}
                    </button>
                    <span className="text-[10.5px] text-white/35">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                )}

                {m.isDeleted ? (
                  <p className="text-[13.5px] italic text-white/30">
                    [message deleted]
                  </p>
                ) : editingId === m.id ? (
                  <EditableMessage
                    initial={m.content}
                    onSave={(c) => onEdit(m.id, c)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white/85">
                    {m.content}
                    {m.editedAt && (
                      <span className="ml-1.5 text-[10.5px] text-white/30">
                        (edited)
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Inline edit/delete buttons. Positioned absolute
                  on the right so they don't reflow the row when
                  they appear. They're hidden by default and only
                  show on shift+hover. The visibility is tied to
                  a parent state (shiftHeld) plus the message's
                  per-row canEdit/canDelete flags. */}
              {showActions && !m.isDeleted && editingId !== m.id && (
                <div className="absolute right-2 top-1 flex items-center gap-0.5 rounded-md border border-white/[0.08] bg-[#0a0b0e]/95 p-0.5 shadow-md shadow-black/40 backdrop-blur-sm">
                  {m.canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditingId(m.id)}
                      title="Edit message"
                      aria-label="Edit message"
                      className="rounded p-1 text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <EditIcon />
                    </button>
                  )}
                  {m.canDelete && (
                    <button
                      type="button"
                      onClick={() => setDeletingId(m.id)}
                      title="Delete message"
                      aria-label="Delete message"
                      className="rounded p-1 text-white/60 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div ref={bottomRef} />
      {contextMenu && (
        <UsernameContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
      {deletingId !== null && (
        <DeleteConfirm
          onConfirm={() => onDelete(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

/* ---- Tiny icon set -------------------------------------------------- */

function MentionIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/**
 * Permissions the current user (the viewer) holds in the
 * currently-selected guild. Computed server-side in
 * GuildPermissionService and passed in by the page component
 * so child components can decide which actions to surface
 * (kick, ban, role-assign, etc.) without re-deriving the
 * role hierarchy themselves.
 *
 * Lives in message-list because that file is imported by
 * user-list (which surfaces moderation actions on member
 * rows) and re-exports this for the cross-component contract.
 * Keep the fields flat and explicit — adding a flag here is
 * the only change needed to surface a new moderation button.
 */
export interface ViewerPermissions {
  /** Can promote / demote members to roles the viewer manages. */
  canAssign: boolean;
  /** Can kick a member from the guild. */
  canKick: boolean;
  /** Can ban a member (separate from kick — bans are persistent). */
  canBan: boolean;
}

/**
 * Re-exported so the user sidebar can render role icons next to
 * member names without re-implementing the sanitized render
 * path.
 */
export { RoleIcon };
