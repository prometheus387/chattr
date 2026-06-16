"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { GuildSummary } from "@/types/client";

interface Props {
  open: boolean;
  guild: GuildSummary | null;
  onClose: () => void;
  /**
   * Called with the freshly updated guild. The parent should update
   * its local copy (sidebar label, current-guild header, etc.) so
   * the rename takes effect everywhere immediately.
   */
  onUpdated: (guild: GuildSummary) => void;
}

const MAX_NAME = 50;

/**
 * Modal for editing a guild's settings. Right now the only editable
 * field is the name; icon upload and the full member/role view will
 * land in a follow-up. Visual style mirrors the create-guild modal
 * so the two dialogs feel like a set.
 *
 * The submit button is disabled for non-admins by virtue of the
 * guild-header menu item being disabled, but the backend re-checks
 * permissions too — a stale modal from a demoted admin still gets
 * a 403 and surfaces the server's message.
 */
export function GuildSettingsModal({ open, guild, onClose, onUpdated }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();

  // Pre-fill the input every time we open with a new guild.
  useEffect(() => {
    if (!open || !guild) return;
    setName(guild.name);
    setError(null);
    setSubmitting(false);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, guild]);

  // Escape closes (unless mid-submit).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open || !guild) return null;

  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= MAX_NAME;
  const dirty = trimmed !== guild.name;

  const validate = (): string | null => {
    if (!trimmed) return "Guild name is required.";
    if (trimmed.length < 2) return "Guild name must be at least 2 characters.";
    if (trimmed.length > MAX_NAME)
      return `Guild name must be ${MAX_NAME} characters or fewer.`;
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!guild.isAdministrator) {
      setError("You don't have permission to edit this guild.");
      return;
    }
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.guilds.update(guild.id, { name: trimmed });
      onUpdated(updated);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError("You don't have permission to edit this guild.");
        } else if (err.status === 404) {
          setError("This guild no longer exists.");
        } else {
          setError(err.message || "Could not save changes.");
        }
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (submitting) return;
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={onBackdropMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
    >
      <form
        onSubmit={onSubmit}
        noValidate
        className="auth-card-enter w-full max-w-[400px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 p-6 shadow-2xl shadow-black/70"
      >
        <div className="flex flex-col gap-1">
          <h2
            id={titleId}
            className="text-[18px] font-semibold tracking-tight text-white"
          >
            Guild settings
          </h2>
          <p className="text-[12.5px] leading-relaxed text-white/45">
            Changes apply to everyone in the guild. Only admins can edit
            these fields.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <label
            htmlFor="guild-settings-name"
            className="text-[12.5px] font-medium text-white/75"
          >
            Guild name
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id="guild-settings-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              maxLength={MAX_NAME}
              placeholder="Guild name"
              autoComplete="off"
              disabled={submitting || !guild.isAdministrator}
              className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 pr-12 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] tabular-nums text-white/30">
              {trimmed.length}/{MAX_NAME}
            </span>
          </div>
          {error ? (
            <p
              role="alert"
              className="auth-shake flex items-center gap-1.5 text-[11.5px] text-rose-300/95"
            >
              {error}
            </p>
          ) : (
            <p className="text-[11.5px] text-white/40">
              2–{MAX_NAME} characters.
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={clsx(
              "h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors",
              "hover:bg-white/[0.05] hover:text-white",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || !dirty || submitting || !guild.isAdministrator}
            className={clsx(
              "group relative inline-flex h-9 min-w-[100px] items-center justify-center gap-2 overflow-hidden rounded-lg px-3.5 text-[12.5px] font-medium transition-all duration-200",
              "bg-white text-[#0b0c0f] hover:bg-white/90",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0b0f]",
            )}
          >
            <span
              className={clsx(
                "flex items-center gap-2 transition-opacity",
                submitting && "opacity-0",
              )}
            >
              Save changes
            </span>
            {submitting ? (
              <span className="absolute inset-0 grid place-items-center">
                <span
                  aria-hidden
                  className="auth-spinner h-3.5 w-3.5 rounded-full border-2 border-[#0b0c0f]/30 border-t-[#0b0c0f]"
                />
              </span>
            ) : null}
          </button>
        </div>
      </form>
    </div>
  );
}
