"use client";

import { useEffect, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from "react";
import clsx from "clsx";
import type { Channel, ChannelKind, DmSummary } from "@/types/client";
import { GuildHeader } from "@/components/client/guild-header";
import { ChannelEditModal, DeleteChannelConfirm } from "@/components/client/channel-modals";
import { DmContextMenu } from "@/components/client/dm-context-menu";

export type SidebarMode =
  | { kind: "guild"; guildHeader: GuildHeaderInfo | null; channels: Channel[]; activeChannelId: number | null; onSelectChannel: (id: number) => void; onLeaveGuild: () => void; onOpenSettings: () => void; onInvite: () => void; leavingGuild: boolean; leaveError: string | null }
  | { kind: "friends"; dms: DmSummary[]; activeDmId: number | null; onSelectDm: (id: number) => void; onStartNewDm: () => void; onDmContextMenu?: (dm: DmSummary, x: number, y: number) => void };

interface GuildHeaderInfo {
  name: string;
  isOwner: boolean;
  isAdministrator: boolean;
  canManageRoles: boolean;
  canManageChannels: boolean;
  canCreateInvite: boolean;
}

interface Props {
  mode: SidebarMode;
  className?: string;
  /**
   * Forwarded to the channel context menu. The page holds
   * the state for the menu / edit / delete modals so the
   * sidebar stays a presentational component.
   */
  onChannelContextMenu?: (channel: Channel, x: number, y: number) => void;
  /**
   * Called after a drag-drop reorder. The page turns the
   * (draggedChannel, targetChannel, position) tuple into a
   * `PATCH /api/guilds/{id}/channels/{channelId}` call.
   */
  onChannelReorder?: (
    dragged: Channel,
    target: Channel,
    position: "before" | "after",
  ) => void;
}

export function ChannelSidebar({ mode, className, onChannelContextMenu, onChannelReorder }: Props) {
  if (mode.kind === "friends") {
    return (
      <FriendsSidebar
        dms={mode.dms}
        activeDmId={mode.activeDmId}
        onSelectDm={mode.onSelectDm}
        onStartNewDm={mode.onStartNewDm}
        onDmContextMenu={mode.onDmContextMenu}
        className={className}
      />
    );
  }
  return (
    <GuildSidebarBody
      channels={mode.channels}
      activeChannelId={mode.activeChannelId}
      onSelectChannel={mode.onSelectChannel}
      guildHeader={mode.guildHeader}
      onLeaveGuild={mode.onLeaveGuild}
      onOpenSettings={mode.onOpenSettings}
      onInvite={mode.onInvite}
      leavingGuild={mode.leavingGuild}
      leaveError={mode.leaveError}
      onChannelContextMenu={onChannelContextMenu}
      onChannelReorder={onChannelReorder}
      className={className}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Friends (DM list) sidebar                                                 */
/* -------------------------------------------------------------------------- */

function FriendsSidebar({
  dms,
  activeDmId,
  onSelectDm,
  onStartNewDm,
  onDmContextMenu,
  className,
}: {
  dms: DmSummary[];
  activeDmId: number | null;
  onSelectDm: (id: number) => void;
  onStartNewDm: () => void;
  onDmContextMenu?: (dm: DmSummary, x: number, y: number) => void;
  className?: string;
}) {
  return (
    <aside
      className={clsx(
        "flex flex-col border-r border-white/[0.06] bg-[#0a0b0e]",
        // Full-width on mobile (single-panel mode), fixed 240px on md+.
        "w-full md:w-60 md:shrink-0",
        className,
      )}
    >
      <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
        <span className="text-[15px] font-semibold text-white">Direct messages</span>
        <button
          type="button"
          onClick={onStartNewDm}
          title="New direct message"
          aria-label="Start a new direct message"
          className="grid h-7 w-7 place-items-center rounded text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {dms.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-white/40">
            No conversations yet. Open a profile from the user list and
            tap “Message” to start a DM.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {dms.map((d) => (
              <li key={d.id}>
                <DmRow
                  dm={d}
                  active={d.id === activeDmId}
                  onClick={() => onSelectDm(d.id)}
                  onContextMenu={
                    onDmContextMenu
                      ? (e) => onDmContextMenu(d, e.clientX, e.clientY)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}

function DmRow({
  dm,
  active,
  onClick,
  onContextMenu,
}: {
  dm: DmSummary;
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const initial = (dm.otherDisplayName || dm.otherUsername).trim().charAt(0).toUpperCase() || "?";
  const preview = dm.lastMessagePreview ?? "No messages yet";
  return (
    <button
      type="button"
      // onMouseDown (not onClick) so the click fires before
      // the browser starts a text selection — without it
      // a left-click on the username either does nothing
      // (selection swallows it) or surfaces the browser's
      // "Copy / Paste" native menu on the next right-click.
      onMouseDown={(e) => {
        if (e.button !== 0) return; // left button only
        e.preventDefault();
        onClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
      className={clsx(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors select-none",
        active
          ? "bg-white/[0.07] text-white"
          : "text-white/65 hover:bg-white/[0.04] hover:text-white/90",
      )}
    >
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-[12px] font-semibold text-emerald-200/90">
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[13.5px] font-medium">
            {dm.otherDisplayName}
          </span>
        </span>
        <span className="block truncate text-[11.5px] text-white/45">
          {preview}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Guild (channel list) sidebar                                              */
/* -------------------------------------------------------------------------- */

interface GuildBodyProps {
  channels: Channel[];
  activeChannelId: number | null;
  onSelectChannel: (id: number) => void;
  guildHeader: GuildHeaderInfo | null;
  onLeaveGuild: () => void;
  onOpenSettings: () => void;
  onInvite: () => void;
  leavingGuild: boolean;
  leaveError: string | null;
  className?: string;
  onChannelContextMenu?: (channel: Channel, x: number, y: number) => void;
  onChannelReorder?: (
    dragged: Channel,
    target: Channel,
    position: "before" | "after",
  ) => void;
}

function bucketByCategory(channels: Channel[]): { name: string; channels: Channel[] }[] {
  const map = new Map<string, Channel[]>();
  for (const c of channels) {
    const key = c.category ?? "(uncategorized)";
    const list = map.get(key) ?? [];
    list.push(c);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([name, list]) => ({ name, channels: list }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function GuildSidebarBody({
  channels,
  activeChannelId,
  onSelectChannel,
  guildHeader,
  onLeaveGuild,
  onOpenSettings,
  onInvite,
  leavingGuild,
  leaveError,
  onChannelContextMenu,
  onChannelReorder,
  className,
}: GuildBodyProps) {
  // ---- Section open / closed state ---------------------------------------
  // We track the *closed* categories, not the open ones — that way
  // the default ("empty closed set") means "everything is open", and
  // new categories that appear later (e.g. after a channel is created)
  // are open by default too. Toggling flips a name in/out of the set.
  const [closedCategories, setClosedCategories] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setClosedCategories(new Set());
  }, [channels]);

  const toggle = (name: string) => {
    setClosedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ---- Drag state ---------------------------------------------------------
  // We track *which* channel is being dragged and *which* channel
  // is currently the drop target, plus whether the drop would land
  // before or after it. The visual cue (a 1px line above/below the
  // target row) reads naturally as "the dragged row will land here".
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<
    | { channelId: number; position: "before" | "after" }
    | null
  >(null);

  const onDragStart = (channel: Channel, e: ReactDragEvent<HTMLLIElement>) => {
    if (!onChannelReorder) return;
    setDraggingId(channel.id);
    // `dataTransfer` is required for the drag to register in
    // Firefox; some browsers ignore `draggable=true` if it's
    // empty. We use the JSON payload to round-trip the
    // channel id through the drop event.
    e.dataTransfer.setData("application/x-chattr-channel-id", String(channel.id));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const onDragOverChannel = (
    channel: Channel,
    position: "before" | "after",
    e: ReactDragEvent<HTMLLIElement>,
  ) => {
    if (!onChannelReorder) return;
    if (draggingId === null || draggingId === channel.id) return;
    e.preventDefault(); // marks the row as a valid drop target
    e.dataTransfer.dropEffect = "move";
    setDropTarget((prev) => {
      if (prev?.channelId === channel.id && prev.position === position) {
        return prev;
      }
      return { channelId: channel.id, position };
    });
  };

  const onDropChannel = (
    channel: Channel,
    e: ReactDragEvent<HTMLLIElement>,
  ) => {
    e.preventDefault();
    if (!onChannelReorder || draggingId === null) return;
    const position = dropTarget?.channelId === channel.id ? dropTarget.position : "before";
    const dragged = channels.find((c) => c.id === draggingId);
    if (!dragged || dragged.id === channel.id) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    onChannelReorder(dragged, channel, position);
    setDraggingId(null);
    setDropTarget(null);
  };

  // Bucket the channels. The drag layer sits *on top* of the
  // existing layout — we still render the same `<ul>` per
  // category, but each row gets drag handlers + a visual
  // insertion-line indicator when it's the active drop target.
  const buckets = bucketByCategory(channels);
  // The user needs `canManageChannels` to drag channels
  // around. We pass that to the row so it can mark itself
  // `draggable=false` (and the cursor stays a pointer, not a
  // grab cursor, when the user can't move it).
  const canDrag = !!onChannelReorder;

  return (
    <aside
      className={clsx(
        "flex flex-col border-r border-white/[0.06] bg-[#0a0b0e]",
        "w-full md:w-60 md:shrink-0",
        className,
      )}
    >
      {guildHeader ? (
        <GuildHeader
          guildName={guildHeader.name}
          isOwner={guildHeader.isOwner}
          isAdministrator={guildHeader.isAdministrator}
          canManageGuild={guildHeader.isAdministrator}
          canManageRoles={guildHeader.canManageRoles}
          canManageChannels={guildHeader.canManageChannels}
          canCreateInvite={guildHeader.canCreateInvite}
          busy={leavingGuild}
          errorMessage={leaveError}
          onLeave={onLeaveGuild}
          onInvite={onInvite}
          onSettings={onOpenSettings}
        />
      ) : (
        <div className="px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wider text-white/40">
          Channels
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {buckets.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-white/40">No channels yet.</p>
        )}
        {buckets.map((bucket) => {
          const open = !closedCategories.has(bucket.name);
          return (
            <div key={bucket.name} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(bucket.name)}
                className="group flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10.5px] font-semibold uppercase tracking-wider text-white/40 transition-colors hover:text-white/65"
                aria-expanded={open}
              >
                <Chevron open={open} />
                <span className="flex-1 truncate">{bucket.name}</span>
                <span className="text-white/30 group-hover:text-white/50">
                  {bucket.channels.length}
                </span>
              </button>
              {open && (
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {bucket.channels.map((c) => (
                    <ChannelRow
                      key={c.id}
                      channel={c}
                      active={c.id === activeChannelId}
                      draggable={canDrag}
                      isDragging={draggingId === c.id}
                      dropIndicator={
                        dropTarget?.channelId === c.id
                          ? dropTarget.position
                          : null
                      }
                      onSelect={() => onSelectChannel(c.id)}
                      onContextMenu={(e) =>
                        onChannelContextMenu?.(c, e.clientX, e.clientY)
                      }
                      onDragStart={(e) => onDragStart(c, e)}
                      onDragEnd={onDragEnd}
                      onDragOverBefore={(e) => onDragOverChannel(c, "before", e)}
                      onDragOverAfter={(e) => onDragOverChannel(c, "after", e)}
                      onDrop={(e) => onDropChannel(c, e)}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Channel row                                                               */
/* -------------------------------------------------------------------------- */

interface ChannelRowProps {
  channel: Channel;
  active: boolean;
  draggable: boolean;
  isDragging: boolean;
  /**
   * `'before'` / `'after'` when this row is the active drop
   * target, null otherwise. The row renders a 1px line above
   * or below itself to communicate the insertion point.
   */
  dropIndicator: "before" | "after" | null;
  onSelect: () => void;
  onContextMenu: (e: ReactMouseEvent<HTMLLIElement>) => void;
  onDragStart: (e: ReactDragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onDragOverBefore: (e: ReactDragEvent<HTMLLIElement>) => void;
  onDragOverAfter: (e: ReactDragEvent<HTMLLIElement>) => void;
  onDrop: (e: ReactDragEvent<HTMLLIElement>) => void;
}

function ChannelRow({
  channel,
  active,
  draggable,
  isDragging,
  dropIndicator,
  onSelect,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOverBefore,
  onDragOverAfter,
  onDrop,
}: ChannelRowProps) {
  return (
    <li
      // The row is split into two drop-zones (top half +
      // bottom half) so the user can place the dragged
      // channel "before" or "after" without having to drag
      // a pixel-perfect target. The handler decides which
      // side the cursor is on via the element's bounding
      // rect.
      onDragOver={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) onDragOverBefore(e);
        else onDragOverAfter(e);
      }}
      onDrop={(e) => {
        // Same midpoint logic for the drop — we use the
        // indicator state the dragover set so the two
        // events always agree.
        onDrop(e);
      }}
      onDragLeave={(e) => {
        // `relatedTarget` is what the cursor is moving
        // INTO. If it stays inside this row we don't
        // want to clear the indicator; only clear when
        // the cursor leaves the row entirely.
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        // (Don't touch dropTarget here — the parent owns
        // it, and the next dragover on a sibling will
        // overwrite it. Clearing here would cause a
        // flicker as the cursor crosses the row boundary.)
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      // onMouseDown (not onClick) so the click fires before
      // the browser starts a text selection. `e.button` is
      // checked so middle-click and right-click don't open
      // the channel (those go through onContextMenu).
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        onSelect();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      className={clsx(
        "relative",
        isDragging && "opacity-40",
      )}
    >
      {/* Insertion line above the row, drawn when this row
          is the active "before" target. We use a
          pseudo-element-friendly border on a 1px-tall
          absolute div. */}
      {dropIndicator === "before" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-px left-0 right-0 h-[2px] rounded-full bg-emerald-400"
        />
      ) : null}
      <button
        type="button"
        // Suppress the native context menu on the button
        // itself — the `<li>` handles it so the right-click
        // works no matter where on the row the user clicks.
        onContextMenu={(e) => e.preventDefault()}
        className={clsx(
          "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[13.5px] transition-colors select-none",
          active
            ? "bg-white/[0.07] text-white"
            : "text-white/65 hover:bg-white/[0.04] hover:text-white/90",
        )}
      >
        <ChannelIcon kind={channel.kind} />
        <span className="truncate">{channel.name}</span>
      </button>
      {dropIndicator === "after" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-emerald-400"
        />
      ) : null}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={11}
      height={11}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("transition-transform duration-150", open ? "rotate-90" : "rotate-0")}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function ChannelIcon({ kind }: { kind: ChannelKind }) {
  if (kind === "Voice") {
    return (
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/45" aria-hidden>
        <path d="M11 5 6 9H2v6h4l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/45" aria-hidden>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
