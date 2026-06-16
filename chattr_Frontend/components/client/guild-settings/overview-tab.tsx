"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { GuildSummary } from "@/types/client";

interface Props {
  guild: GuildSummary;
  /**
   * Bubbles the post-rename guild up to the parent so the sidebar
   * label, channel-sidebar header, and the open-guild pill all
   * update at once.
   */
  onUpdated: (guild: GuildSummary) => void;
}

const MAX_NAME = 50;

/**
 * Overview tab: rename the guild, change the icon URL, and surface
 * a danger zone (transfer ownership — placeholder — and leave
 * guild). Only visible to owners / admins; the parent hides the
 * tab if `guild.isAdministrator` is false.
 *
 * The "rename" form lives here rather than in a separate file
 * because it's a single field with a single save button — pulling
 * it out would just add an import without any reuse benefit.
 */
export function OverviewTab({ guild, onUpdated }: Props) {
  const [name, setName] = useState(guild.name);
  const [iconUrl, setIconUrl] = useState(guild.iconUrl ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingIcon, setSavingIcon] = useState(false);
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null);
  const [iconSavedAt, setIconSavedAt] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Re-seed the form when we open the modal against a different
  // guild (the modal is unmounted on close, but a hot-swap of
  // `guild` would otherwise leave the inputs stale).
  useEffect(() => {
    setName(guild.name);
    setIconUrl(guild.iconUrl ?? "");
    setNameError(null);
    setIconError(null);
    setNameSavedAt(null);
    setIconSavedAt(null);
  }, [guild.id, guild.name, guild.iconUrl]);

  const trimmedName = name.trim();
  const nameValid =
    trimmedName.length >= 2 && trimmedName.length <= MAX_NAME;
  const nameDirty = trimmedName !== guild.name;
  const iconDirty = (iconUrl.trim() || null) !== (guild.iconUrl ?? null);

  const validateName = (): string | null => {
    if (!trimmedName) return "Guild name is required.";
    if (trimmedName.length < 2) return "Guild name must be at least 2 characters.";
    if (trimmedName.length > MAX_NAME) {
      return `Guild name must be ${MAX_NAME} characters or fewer.`;
    }
    return null;
  };

  const onSubmitName = async (e: FormEvent) => {
    e.preventDefault();
    const v = validateName();
    if (v) {
      setNameError(v);
      return;
    }
    if (!nameDirty) return;
    setNameError(null);
    setSavingName(true);
    try {
      const updated = await api.guilds.update(guild.id, { name: trimmedName });
      onUpdated(updated);
      setNameSavedAt(Date.now());
    } catch (err) {
      setNameError(
        err instanceof ApiError
          ? err.status === 403
            ? "You don't have permission to edit this guild."
            : err.status === 404
              ? "This guild no longer exists."
              : err.message || "Could not save changes."
          : "Network error. Please try again.",
      );
    } finally {
      setSavingName(false);
    }
  };

  const onSubmitIcon = async (e: FormEvent) => {
    e.preventDefault();
    if (!iconDirty) return;
    setIconError(null);
    setSavingIcon(true);
    try {
      const updated = await api.guilds.update(guild.id, {
        iconUrl: iconUrl.trim() ? iconUrl.trim() : null,
      });
      onUpdated(updated);
      setIconSavedAt(Date.now());
    } catch (err) {
      setIconError(
        err instanceof ApiError
          ? err.status === 403
            ? "You don't have permission to edit this guild."
            : err.message || "Could not save changes."
          : "Network error. Please try again.",
      );
    } finally {
      setSavingIcon(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Guild name"
        description="Shown in the sidebar, channel header, and any invite previews."
      >
        <form onSubmit={onSubmitName} noValidate className="flex flex-col gap-2">
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                  if (nameSavedAt) setNameSavedAt(null);
                }}
                maxLength={MAX_NAME}
                placeholder="Guild name"
                autoComplete="off"
                disabled={savingName}
                className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 pr-12 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] tabular-nums text-white/30">
                {trimmedName.length}/{MAX_NAME}
              </span>
            </div>
            <button
              type="submit"
              disabled={!nameValid || !nameDirty || savingName}
              className={clsx(
                "h-[42px] shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 text-[12.5px] font-medium text-white/85 transition-colors",
                "hover:bg-white/[0.08] hover:text-white",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {savingName ? "Saving…" : "Save"}
            </button>
          </div>
          {nameError ? (
            <p
              role="alert"
              className="auth-shake text-[11.5px] text-rose-300/95"
            >
              {nameError}
            </p>
          ) : nameSavedAt && !nameDirty ? (
            <p className="text-[11.5px] text-emerald-300/80">Saved.</p>
          ) : (
            <p className="text-[11.5px] text-white/40">
              2–{MAX_NAME} characters. Changes apply to every member.
            </p>
          )}
        </form>
      </Section>

      <Section
        title="Guild icon"
        description="A square image URL. Leave blank to use the first letter as the avatar."
      >
        <form onSubmit={onSubmitIcon} noValidate className="flex items-stretch gap-3">
          <div className="grid h-[64px] w-[64px] shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] text-[20px] font-semibold text-white/80">
            {iconUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  // Hide the broken image but keep the slot — the user
                  // can see the URL didn't load without the form
                  // suddenly resizing.
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              (trimmedName.charAt(0).toUpperCase() || "?")
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-stretch gap-2">
              <input
                type="url"
                value={iconUrl}
                onChange={(e) => {
                  setIconUrl(e.target.value);
                  if (iconError) setIconError(null);
                  if (iconSavedAt) setIconSavedAt(null);
                }}
                placeholder="https://example.com/icon.png"
                autoComplete="off"
                disabled={savingIcon}
                className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!iconDirty || savingIcon}
                className={clsx(
                  "h-[42px] shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 text-[12.5px] font-medium text-white/85 transition-colors",
                  "hover:bg-white/[0.08] hover:text-white",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {savingIcon ? "Saving…" : "Save"}
              </button>
            </div>
            {iconError ? (
              <p role="alert" className="auth-shake text-[11.5px] text-rose-300/95">
                {iconError}
              </p>
            ) : iconSavedAt && !iconDirty ? (
              <p className="text-[11.5px] text-emerald-300/80">Saved.</p>
            ) : (
              <p className="text-[11.5px] text-white/40">
                Any square image URL works. Empty clears the icon.
              </p>
            )}
          </div>
        </form>
      </Section>

      <Section
        title="Member count"
        description="Read-only — derived from the server on every list refresh."
      >
        <p className="text-[13px] tabular-nums text-white/75">
          {guild.memberCount} {guild.memberCount === 1 ? "member" : "members"}
        </p>
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-white/55">
          {title}
        </h4>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-white/40">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
