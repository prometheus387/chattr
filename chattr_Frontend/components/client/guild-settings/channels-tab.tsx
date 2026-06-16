"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { Channel, ChannelKind, GuildSummary } from "@/types/client";

interface Props {
  guild: GuildSummary;
  channels: Channel[] | null;
  onDataChanged: () => void;
}

/**
 * Channels tab: list, create, edit (rename / recategorise /
 * re-position), and delete channels. The tab is only rendered
 * for users with `CanManageChannels`; the server re-checks
 * the flag on every mutation regardless.
 *
 * We group the list client-side by category — the same
 * bucketing the channel sidebar uses — so the order matches
 * what the user sees in the main view, and adding a channel
 * to a category that already exists in the sidebar drops it
 * straight into the right bucket.
 */
export function ChannelsTab({ guild, channels, onDataChanged }: Props) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [deleting, setDeleting] = useState<Channel | null>(null);

  if (channels === null) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-white/45">
        <span
          aria-hidden
          className="auth-spinner h-3.5 w-3.5 rounded-full border-2 border-white/15 border-t-white/60"
        />
        Loading channels…
      </div>
    );
  }

  const buckets = bucketByCategory(channels);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3">
        <p className="text-[12px] leading-relaxed text-white/45">
          {channels.length} {channels.length === 1 ? "channel" : "channels"}{" "}
          in {buckets.length}{" "}
          {buckets.length === 1 ? "category" : "categories"}.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={clsx(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 text-[12.5px] font-medium text-white/85 transition-colors",
            "hover:bg-white/[0.08] hover:text-white",
          )}
        >
          <PlusIcon />
          New channel
        </button>
      </header>

      <div className="flex flex-col gap-4">
        {buckets.map((bucket) => (
          <section key={bucket.name}>
            <h4 className="mb-1.5 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-white/40">
              <span>{bucket.name}</span>
              <span className="text-white/25">{bucket.channels.length}</span>
            </h4>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-white/[0.06] bg-white/[0.02] text-[10.5px] uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5 w-24">Kind</th>
                    <th className="px-4 py-2.5 w-20">Position</th>
                    <th className="px-4 py-2.5 text-right w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.channels.map((c) => (
                    <ChannelRow
                      key={c.id}
                      channel={c}
                      onEdit={() => setEditing(c)}
                      onDelete={() => setDeleting(c)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-10 text-center text-[12.5px] text-white/45">
            No channels yet. Create one to get started.
          </div>
        ) : null}
      </div>

      {creating ? (
        <ChannelEditModal
          mode="create"
          guild={guild}
          onClose={() => setCreating(false)}
          onSaved={onDataChanged}
        />
      ) : null}
      {editing ? (
        <ChannelEditModal
          mode="edit"
          guild={guild}
          channel={editing}
          onClose={() => setEditing(null)}
          onSaved={onDataChanged}
        />
      ) : null}
      {deleting ? (
        <DeleteChannelConfirm
          channel={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.guildChannels.delete(guild.id, deleting.id);
              setDeleting(null);
              onDataChanged();
            } catch (err) {
              alert(
                err instanceof ApiError
                  ? err.message
                  : "Network error.",
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function bucketByCategory(
  channels: Channel[],
): { name: string; channels: Channel[] }[] {
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

function ChannelRow({
  channel,
  onEdit,
  onDelete,
}: {
  channel: Channel;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-white/[0.04] last:border-b-0 transition-colors hover:bg-white/[0.02]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <ChannelIcon kind={channel.kind} />
          <span className="truncate text-white/90">{channel.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-white/55">{channel.kind}</td>
      <td className="px-4 py-3 tabular-nums text-white/55">{channel.position}</td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md px-2 py-1 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md px-2 py-1 text-[12px] text-rose-300/80 transition-colors hover:bg-rose-400/[0.08] hover:text-rose-200"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function ChannelIcon({ kind }: { kind: ChannelKind }) {
  if (kind === "Voice") {
    return (
      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/45" aria-hidden>
        <path d="M11 5 6 9H2v6h4l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/45" aria-hidden>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

interface EditProps {
  mode: "create" | "edit";
  guild: GuildSummary;
  channel?: Channel;
  onClose: () => void;
  onSaved: () => void;
}

function ChannelEditModal({ mode, guild, channel, onClose, onSaved }: EditProps) {
  const titleId = useId();
  const [name, setName] = useState(channel?.name ?? "");
  const [category, setCategory] = useState(channel?.category ?? "");
  const [position, setPosition] = useState<number>(channel?.position ?? 0);
  const [kind, setKind] = useState<ChannelKind>(channel?.kind ?? "Text");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      nameRef.current?.focus();
      if (mode === "edit") nameRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [mode]);

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 2 && trimmedName.length <= 50;
  const categoryValid = category.length <= 50;

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
      if (mode === "create") {
        await api.guildChannels.create(guild.id, {
          name: trimmedName,
          category: category.trim() || null,
          kind,
        });
      } else if (channel) {
        await api.guildChannels.update(guild.id, channel.id, {
          name: trimmedName,
          category: category.trim() ? category.trim() : null,
          position: position === channel.position ? undefined : position,
        });
      }
      onSaved();
      onClose();
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
        className="auth-card-enter w-full max-w-[480px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 shadow-2xl shadow-black/70"
      >
        <header className="border-b border-white/[0.06] px-6 py-4">
          <h3 id={titleId} className="text-[16px] font-semibold text-white">
            {mode === "create" ? "New channel" : `Edit #${channel?.name}`}
          </h3>
          <p className="mt-0.5 text-[12px] text-white/45">
            {mode === "create"
              ? "Channels group conversations. Members see this in the sidebar."
              : "Renaming a channel keeps its history and members."}
          </p>
        </header>

        <div className="space-y-4 px-6 py-5">
          <Field label="Channel name" hint="2–50 characters. # is added in the UI.">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              disabled={saving}
              className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
              placeholder="general"
            />
          </Field>
          <Field label="Category" hint="Used to group channels in the sidebar. Leave empty for uncategorized.">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={50}
              disabled={saving}
              className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
              placeholder="Text Channels"
            />
          </Field>
          {mode === "create" ? (
            <Field label="Kind">
              <div className="flex items-center gap-2">
                {(["Text", "Voice"] as const).map((k) => (
                  <label
                    key={k}
                    className={clsx(
                      "flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3.5 text-[12.5px] transition-colors",
                      kind === k
                        ? "border-emerald-400/30 bg-emerald-400/[0.08] text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-white/65 hover:bg-white/[0.05]",
                    )}
                  >
                    <input
                      type="radio"
                      checked={kind === k}
                      onChange={() => setKind(k)}
                      disabled={saving}
                      className="sr-only"
                    />
                    {k}
                  </label>
                ))}
              </div>
            </Field>
          ) : (
            <Field label="Position" hint="Lower numbers appear first within the category.">
              <input
                type="number"
                min={0}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value) || 0)}
                disabled={saving}
                className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13.5px] text-white outline-none disabled:opacity-60"
              />
            </Field>
          )}
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
            disabled={!nameValid || !categoryValid || saving}
            className="h-9 min-w-[100px] rounded-lg bg-white px-3.5 text-[12.5px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create channel"
                : "Save changes"}
          </button>
        </footer>
      </form>
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

/* -------------------------------------------------------------------------- */

function DeleteChannelConfirm({
  channel,
  onCancel,
  onConfirm,
}: {
  channel: Channel;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="auth-card-enter w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 p-6 shadow-2xl shadow-black/70">
        <h3 className="text-[16px] font-semibold text-white">Delete channel</h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
          <span className="text-white/85">#{channel.name}</span> and every
          message in it will be permanently removed. This cannot be undone.
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
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="h-9 rounded-lg bg-rose-400/[0.12] px-3.5 text-[12.5px] font-medium text-rose-200 transition-colors hover:bg-rose-400/[0.20] disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete channel"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
