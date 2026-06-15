"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { GuildSummary } from "@/types/client";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Called with the freshly created guild. The parent is expected to
   * insert it into its local list and switch the selection to it.
   */
  onCreated: (guild: GuildSummary) => void;
}

const MAX_NAME = 50;

/**
 * Modal dialog for creating a new guild. Submits to
 * `POST /api/guilds` via `api.guilds.create`. The visual style
 * intentionally mirrors the auth forms (same input chrome, same
 * emerald focus ring) so it doesn't feel bolted on.
 */
export function CreateGuildModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();

  // Reset state every time the modal opens, and focus the input.
  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
    setSubmitting(false);
    // The modal mounts/unmounts together with `open`; the rAF just
    // gives the browser a tick to paint the dialog before focusing.
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= MAX_NAME;

  const validate = (): string | null => {
    if (!trimmed) return "Guild name is required.";
    if (trimmed.length < 2) return "Guild name must be at least 2 characters.";
    if (trimmed.length > MAX_NAME)
      return `Guild name must be ${MAX_NAME} characters or fewer.`;
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const guild = await api.guilds.create(trimmed);
      onCreated(guild);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Could not create guild.");
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Click on the backdrop closes (unless we're mid-submit).
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
            Create a guild
          </h2>
          <p className="text-[12.5px] leading-relaxed text-white/45">
            Guilds are shared spaces with their own channels. You become the
            owner, and we add <span className="text-white/70">#general</span>{" "}
            and <span className="text-white/70">#announcements</span> to get you
            started.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <label
            htmlFor="guild-name"
            className="text-[12.5px] font-medium text-white/75"
          >
            Guild name
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id="guild-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              maxLength={MAX_NAME}
              placeholder="My guild"
              autoComplete="off"
              disabled={submitting}
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
            disabled={!valid || submitting}
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
              Create guild
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
