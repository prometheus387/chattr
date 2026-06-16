"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { Channel } from "@/types/client";

/**
 * Quick-edit modal for a channel. Used by the channel
 * context menu (left / right click on a channel row in the
 * sidebar). Position is intentionally not editable here —
 * the user reorders channels via drag-and-drop in the
 * sidebar, not by typing a number. Keeping this form to
 * just name + category makes the modal small and quick.
 *
 * For the new-channel flow in the settings modal the
 * settings-side `ChannelEditModal` (in channels-tab.tsx)
 * adds a kind toggle (Text / Voice) since new channels
 * need an initial kind. Editing an existing channel
 * doesn't, so this version doesn't.
 */
export function ChannelEditModal({
  open,
  channel,
  onClose,
  onSaved,
}: {
  open: boolean;
  channel: Channel;
  onClose: () => void;
  onSaved: (updated: Channel) => void;
}) {
  const titleId = useId();
  const [name, setName] = useState(channel.name);
  const [category, setCategory] = useState(channel.category ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed the form every time we open with a different
  // channel. The parent re-mounts this component via
  // `key`, but the seed is cheap and explicit here for
  // safety.
  useEffect(() => {
    if (!open) return;
    setName(channel.name);
    setCategory(channel.category ?? "");
    setError(null);
  }, [open, channel.id, channel.name, channel.category]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 2 && trimmedName.length <= 50;
  const categoryValid = category.length <= 50;
  const nameDirty = trimmedName !== channel.name;
  const categoryDirty = (category.trim() || null) !== (channel.category ?? null);
  const dirty = nameDirty || categoryDirty;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameValid) {
      setError("Channel name must be 2–50 characters.");
      return;
    }
    if (!categoryValid) {
      setError("Category must be 50 characters or fewer.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await api.guildChannels.update(
        channel.guildId,
        channel.id,
        {
          name: nameDirty ? trimmedName : undefined,
          category: categoryDirty ? (category.trim() ? category.trim() : null) : undefined,
        },
      );
      onSaved(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 403
            ? "You don't have permission to edit this channel."
            : err.message || "Could not save changes."
          : "Network error.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!saving && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <form
        onSubmit={onSubmit}
        noValidate
        className="auth-card-enter w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 shadow-2xl shadow-black/70"
      >
        <header className="border-b border-white/[0.06] px-6 py-4">
          <h3 id={titleId} className="text-[16px] font-semibold text-white">
            Edit channel
          </h3>
          <p className="mt-0.5 text-[12px] text-white/45">
            Reorder channels with drag-and-drop in the sidebar.
          </p>
        </header>

        <div className="space-y-4 px-6 py-5">
          <Field label="Channel name" hint="2–50 characters. # is added in the UI.">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              maxLength={50}
              placeholder="general"
              autoComplete="off"
              disabled={saving}
              className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
            />
          </Field>
          <Field label="Category" hint="Used to group channels in the sidebar. Empty = uncategorized.">
            <input
              type="text"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                if (error) setError(null);
              }}
              maxLength={50}
              placeholder="Text Channels"
              autoComplete="off"
              disabled={saving}
              className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
            />
          </Field>
          {error ? (
            <p role="alert" className="auth-shake text-[11.5px] text-rose-300/95">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] bg-[#0a0b0e] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!dirty || !nameValid || !categoryValid || saving}
            className="h-9 min-w-[110px] rounded-lg bg-white px-3.5 text-[12.5px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}

/**
 * Confirm dialog for deleting a channel. Same visual
 * language as the kick/ban dialogs: a single red CTA,
 * destructive but not surprising.
 */
export function DeleteChannelConfirm({
  channel,
  busy,
  onCancel,
  onConfirm,
}: {
  channel: Channel;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="auth-card-enter w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 p-6 shadow-2xl shadow-black/70">
        <h3 id={titleId} className="text-[16px] font-semibold text-white">
          Delete #{channel.name}?
        </h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
          The channel and every message in it will be permanently
          removed. This cannot be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="group relative inline-flex h-9 min-w-[110px] items-center justify-center gap-2 overflow-hidden rounded-lg bg-rose-400/[0.12] px-3.5 text-[12.5px] font-medium text-rose-200 transition-colors hover:bg-rose-400/[0.20] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={clsx("flex items-center gap-2", busy && "opacity-0")}>
              Delete channel
            </span>
            {busy ? (
              <span
                aria-hidden
                className="auth-spinner absolute inset-0 m-auto h-3.5 w-3.5 rounded-full border-2 border-rose-200/30 border-t-rose-200"
              />
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wider text-white/45">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-white/35">{hint}</p> : null}
    </div>
  );
}
