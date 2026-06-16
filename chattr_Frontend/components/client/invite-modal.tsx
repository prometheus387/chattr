"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError, type GuildInvite } from "@/types/api";
import type { GuildSummary } from "@/types/client";

interface Props {
  open: boolean;
  guild: GuildSummary;
  onClose: () => void;
}

/**
 * Modal for issuing a fresh invite link to a guild. On open
 * we generate a new invite (`unlimitedUse=true`, no expiry) so
 * the user can copy a working URL immediately. The "advanced"
 * section is reserved for max-use / expiry — kept as a future
 * extension point since the dropdown entry is the common path
 * and the simpler form covers most of the use cases.
 *
 * The full URL is shown as a single line with a Copy button;
 * the link itself is only available after the server returns
 * the freshly-minted code, so the user can never accidentally
 * copy a stale or never-issued URL.
 */
export function InviteModal({ open, guild, onClose }: Props) {
  const titleId = useId();
  const [invite, setInvite] = useState<GuildInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset state every time we open. We deliberately re-mint a
  // fresh invite each time the modal opens — sharing a code
  // between openings would let a leaked link outlive its
  // intended lifetime. Server caps invites per guild at
  // one-per-second so spam-clicking "Invite" is harmless.
  useEffect(() => {
    if (!open) return;
    setInvite(null);
    setError(null);
    setCopied(false);
    let cancelled = false;
    setCreating(true);
    (async () => {
      try {
        const result = await api.guildInvites.create(guild.id, {});
        if (cancelled) return;
        setInvite(result);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.status === 403
              ? "You don't have permission to create invites in this guild."
              : err.message || "Could not create invite."
            : "Network error.",
        );
      } finally {
        if (!cancelled) setCreating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, guild.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !creating) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, creating, onClose]);

  if (!open) return null;

  // Build the share URL from the live code. We use
  // `window.location.origin` so the link matches whatever
  // host the user is on (dev, staging, prod) — hardcoding
  // chattr.cc would break local development.
  const shareUrl = invite
    ? `${window.location.origin}/invite/${invite.code}`
    : "";

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      // The Clipboard API is gated on https / localhost. Fall
      // back to the legacy `document.execCommand` path if
      // `navigator.clipboard` is missing (older browsers, some
      // sandboxed iframes).
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      // The user can still select-and-copy manually; we just
      // don't get to flash the "Copied!" toast.
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!creating && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="auth-card-enter w-full max-w-[480px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 shadow-2xl shadow-black/70">
        <header className="border-b border-white/[0.06] px-6 py-4">
          <h3 id={titleId} className="text-[16px] font-semibold text-white">
            Invite people to {guild.name}
          </h3>
          <p className="mt-0.5 text-[12px] text-white/45">
            Share the link below. Anyone with the link can join the guild
            until you revoke it.
          </p>
        </header>

        <div className="space-y-4 px-6 py-5">
          {error ? (
            <p
              role="alert"
              className="auth-shake text-[12.5px] text-rose-300/95"
            >
              {error}
            </p>
          ) : null}

          {creating && !invite ? (
            <div className="flex items-center gap-2 text-[12.5px] text-white/55">
              <span
                aria-hidden
                className="auth-spinner h-3.5 w-3.5 rounded-full border-2 border-white/15 border-t-white/60"
              />
              Creating invite…
            </div>
          ) : null}

          {invite ? (
            <>
              <Field label="Invite link">
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.currentTarget.select()}
                    className="auth-input w-full select-all rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[12px] text-white/85 outline-none"
                  />
                  <button
                    type="button"
                    onClick={onCopy}
                    className={clsx(
                      "h-[42px] shrink-0 rounded-lg border px-4 text-[12.5px] font-medium transition-colors",
                      copied
                        ? "border-emerald-400/30 bg-emerald-400/[0.12] text-emerald-200"
                        : "border-white/[0.08] bg-white/[0.04] text-white/85 hover:bg-white/[0.08] hover:text-white",
                    )}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </Field>

              <Field label="Code" hint="The 10-char token. Re-issuing creates a fresh one.">
                <code className="block select-all rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2 font-mono text-[12px] text-white/70">
                  {invite.code}
                </code>
              </Field>
            </>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] bg-[#0a0b0e] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            Done
          </button>
        </footer>
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
