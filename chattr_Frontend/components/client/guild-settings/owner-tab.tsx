"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { GuildSummary } from "@/types/client";

/**
 * Owner-only destructive-action tab. Four buttons:
 * <list type="bullet">
 *   <item><b>Archive</b> — freezes the guild. Evicts
 *         non-owner members, revokes invites. The owner
 *         keeps posting. Data is preserved (channels,
 *         messages, roles, history) so the action is
 *         reversible via Unarchive.</item>
 *   <item><b>Unarchive</b> — reverse of Archive.
 *         Idempotent.</item>
 *   <item><b>Delete guild</b> — hard delete. FK cascade
 *         wipes children. The owner has to leave the
 *         client too (we don't keep their last member row
 *         by default — the guild is gone).</item>
 *   <item><b>Burn guild</b> — explicit per-child cleanup
 *         (messages, channels, roles, members, invites,
 *         vouches) before the guild row. Same end state
 *         as Delete; the spec calls for the explicit
 *         walk-through rather than relying on the
 *         cascade. Distinguishing visual style (deeper
 *         red, "this cannot be undone" copy) to make
 *         sure the user knows they're hitting the
 *         nuclear option.</item>
 * </list>
 *
 * Each destructive action (Delete, Burn) requires a
 * confirm-dialog that re-types the guild name. Archive
 * and Unarchive are softer — they explain what will
 * happen and just need a single confirm click.
 */
interface Props {
  guild: GuildSummary;
  /**
   * Called after Delete or Burn so the parent can close
   * the modal and let the page-level handler clear the
   * active-guild selection. Archive / Unarchive keep the
   * modal open so the owner can continue tinkering.
   */
  onClose: () => void;
  /**
   * Called after Archive / Unarchive with a fresh
   * <see cref="GuildSummary"/> that flips the
   * <c>isArchived</c> flag. The parent uses this to
   * update the cache so the rest of the UI (sidebar,
   * header) reflects the new state without a refetch.
   */
  onUpdated?: (guild: GuildSummary) => void;
}

type Pending = "archive" | "unarchive" | "delete" | "burn" | null;
type Confirm =
  | { kind: "delete" }
  | { kind: "burn" }
  | null;

export function OwnerTab({ guild, onClose, onUpdated }: Props) {
  const [pending, setPending] = useState<Pending>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ---- Run the action ------------------------------------------------

  const runArchive = async () => {
    setPending("archive");
    setError(null);
    try {
      await api.guilds.archive(guild.id);
      // The archive endpoint returns 204 with no body.
      // The parent's `isArchived` cache is the source of
      // truth for the rest of the UI, so we synthesise
      // an updated GuildSummary with the flag flipped and
      // bubble it up via the same onUpdated callback the
      // Overview tab uses for renames. This is cheaper
      // than a refetch and keeps the archive-state
      // consistent across the sidebar / header / tab in
      // a single render cycle.
      onUpdated?.({ ...guild, isArchived: true });
      setPending(null);
    } catch (err) {
      setError(toMessage(err));
      setPending(null);
    }
  };

  const runUnarchive = async () => {
    setPending("unarchive");
    setError(null);
    try {
      await api.guilds.unarchive(guild.id);
      onUpdated?.({ ...guild, isArchived: false });
      setPending(null);
    } catch (err) {
      setError(toMessage(err));
      setPending(null);
    }
  };

  const runDelete = async () => {
    if (confirmText.trim() !== guild.name) {
      setError(`Type "${guild.name}" exactly to confirm.`);
      return;
    }
    setPending("delete");
    setError(null);
    try {
      await api.guilds.delete(guild.id);
      setPending(null);
      setConfirm(null);
      setConfirmText("");
      // Drop the modal — the page needs to refresh the
      // guild list to drop this entry.
      onClose();
    } catch (err) {
      setError(toMessage(err));
      setPending(null);
    }
  };

  const runBurn = async () => {
    if (confirmText.trim() !== guild.name) {
      setError(`Type "${guild.name}" exactly to confirm.`);
      return;
    }
    setPending("burn");
    setError(null);
    try {
      await api.guilds.burn(guild.id);
      setPending(null);
      setConfirm(null);
      setConfirmText("");
      onClose();
    } catch (err) {
      setError(toMessage(err));
      setPending(null);
    }
  };

  // ---- Render ---------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Archive / Unarchive — reversible, less scary */}
      <Section
        title={guild.isArchived ? "Unarchive guild" : "Archive guild"}
        description={
          guild.isArchived
            ? "Restore this guild so people can join again. Channels, messages, roles, and history come back."
            : "Freeze the guild. Members (except you) are removed, invites are revoked, and only you can keep posting. Channels, messages, and history are kept so you can unarchive later."
        }
      >
        {guild.isArchived ? (
          <ActionButton
            onClick={runUnarchive}
            loading={pending === "unarchive"}
            label="Unarchive"
            tone="primary"
          />
        ) : (
          <ActionButton
            onClick={runArchive}
            loading={pending === "archive"}
            label="Archive guild"
            tone="warning"
          />
        )}
      </Section>

      {/* Archive-state banner — only shown when archived */}
      {guild.isArchived ? (
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-[12.5px] leading-relaxed text-amber-100/85">
          <div className="font-semibold text-amber-200">This guild is archived.</div>
          <p className="mt-1 text-amber-100/70">
            Only you can post here. New members can't join until you unarchive.
          </p>
        </div>
      ) : null}

      {/* Delete — destructive but the cascade is conventional */}
      <Section
        title="Delete guild"
        description="Permanently remove this guild. Channels, messages, roles, members, and invites are deleted through the FK cascade. This cannot be undone."
        tone="danger"
      >
        <ActionButton
          onClick={() => {
            setConfirm({ kind: "delete" });
            setError(null);
            setConfirmText("");
          }}
          label="Delete guild"
          tone="danger"
          loading={false}
        />
      </Section>

      {/* Burn — explicit per-child cleanup */}
      <Section
        title="Burn guild"
        description="The nuclear option. Every message, channel, role, member, invite, and vouch is removed row-by-row before the guild itself is deleted. End state is the same as Delete — this exists because the spec calls for explicit cleanup, not because Delete leaves anything behind."
        tone="burn"
      >
        <ActionButton
          onClick={() => {
            setConfirm({ kind: "burn" });
            setError(null);
            setConfirmText("");
          }}
          label="Burn guild"
          tone="burn"
          loading={false}
        />
      </Section>

      {/* Error toast — inline so it doesn't depend on a global
          notification system. Single line so it doesn't take
          the user's eye off the action they just took. */}
      {error ? (
        <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-[12.5px] text-rose-200/90">
          {error}
        </div>
      ) : null}

      {/* Confirm modal — type-the-name guard for Delete/Burn.
          Archive / Unarchive don't need this; their intent
          is reversible. */}
      {confirm ? (
        <ConfirmDialog
          kind={confirm.kind}
          guildName={guild.name}
          confirmText={confirmText}
          onConfirmTextChange={setConfirmText}
          onCancel={() => {
            setConfirm(null);
            setConfirmText("");
            setError(null);
          }}
          onSubmit={confirm.kind === "delete" ? runDelete : runBurn}
          loading={pending === "delete" || pending === "burn"}
        />
      ) : null}
    </div>
  );
}

// ---- Sub-components ---------------------------------------------------

function Section({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description: string;
  tone?: "danger" | "burn";
  children: React.ReactNode;
}) {
  const isScary = tone === "danger" || tone === "burn";
  return (
    <div
      className={
        isScary
          ? "rounded-xl border border-rose-400/20 bg-rose-400/[0.04] p-5"
          : "rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
      }
    >
      <h4
        className={
          tone === "burn"
            ? "text-[14px] font-semibold tracking-tight text-rose-200/95"
            : tone === "danger"
            ? "text-[14px] font-semibold tracking-tight text-rose-200/95"
            : "text-[14px] font-semibold tracking-tight text-white"
        }
      >
        {title}
      </h4>
      <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
        {description}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  loading,
  tone,
}: {
  onClick: () => void;
  label: string;
  loading: boolean;
  tone: "primary" | "warning" | "danger" | "burn";
}) {
  const base = "h-9 rounded-lg px-4 text-[12.5px] font-medium transition-colors disabled:opacity-50";
  const cls =
    tone === "primary"
      ? "bg-white/[0.06] text-white hover:bg-white/[0.10] " + base
      : tone === "warning"
      ? "border border-amber-300/30 bg-amber-300/[0.08] text-amber-200/95 hover:bg-amber-300/[0.12] " + base
      : tone === "danger"
      ? "border border-rose-400/30 bg-rose-400/[0.08] text-rose-200/95 hover:bg-rose-400/[0.12] " + base
      : // burn — deep red, intentional "this is the end"
      "border border-rose-500/40 bg-rose-500/[0.12] text-rose-100/95 hover:bg-rose-500/[0.18] " + base;
  return (
    <button type="button" onClick={onClick} disabled={loading} className={cls}>
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {label}…
        </span>
      ) : (
        label
      )}
    </button>
  );
}

function ConfirmDialog({
  kind,
  guildName,
  confirmText,
  onConfirmTextChange,
  onCancel,
  onSubmit,
  loading,
}: {
  kind: "delete" | "burn";
  guildName: string;
  confirmText: string;
  onConfirmTextChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const isBurn = kind === "burn";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-[460px] rounded-2xl border border-rose-500/30 bg-[#0c0d11]/95 p-6 shadow-2xl shadow-black/80">
        <h3 className="text-[18px] font-semibold tracking-tight text-white">
          {isBurn ? "Burn guild" : "Delete guild"}
        </h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/60">
          This action <b>cannot be undone</b>. Type the guild's
          name to confirm:
        </p>
        <code className="mt-3 block select-all rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12.5px] text-white/85">
          {guildName}
        </code>
        <input
          type="text"
          autoFocus
          value={confirmText}
          onChange={(e) => onConfirmTextChange(e.target.value)}
          placeholder={guildName}
          className="mt-3 h-10 w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 text-[13px] text-white placeholder:text-white/30 focus:border-rose-400/40 focus:outline-none"
        />
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading || confirmText.trim() !== guildName}
            className={
              isBurn
                ? "h-9 rounded-lg border border-rose-500/40 bg-rose-500/[0.18] px-4 text-[12.5px] font-medium text-rose-100 transition-colors hover:bg-rose-500/[0.25] disabled:opacity-40"
                : "h-9 rounded-lg border border-rose-400/30 bg-rose-400/[0.12] px-4 text-[12.5px] font-medium text-rose-100 transition-colors hover:bg-rose-400/[0.18] disabled:opacity-40"
            }
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Spinner />
                {isBurn ? "Burning…" : "Deleting…"}
              </span>
            ) : isBurn ? (
              "Burn guild"
            ) : (
              "Delete guild"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      viewBox="0 0 24 24"
      width={13}
      height={13}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.status === 0
      ? "Network error. Check your connection and try again."
      : `${err.status} — ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Unexpected error.";
}
