"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError, type InvitePreview } from "@/types/api";

const WEB_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{10}$/;
const TRAILING_PUNCTUATION = /[.,!?;:)}\]]+$/;

interface InviteReference {
  code: string;
  url: string;
}

/**
 * Extract a chattr invite from a URL without coupling it to a hostname.
 * This deliberately looks only at the route shape, so links created on
 * localhost keep working after the app moves to its production domain.
 */
export function inviteCodeFromUrl(rawUrl: string): string | null {
  const candidate = rawUrl.replace(TRAILING_PUNCTUATION, "");

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const segments = url.pathname.split("/").filter(Boolean);
    const encodedCode =
      segments.length === 2 && segments[0].toLowerCase() === "invite"
        ? segments[1]
        : segments.length === 1
          ? segments[0]
          : null;

    if (!encodedCode) return null;
    const code = decodeURIComponent(encodedCode);
    return INVITE_CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}

function inviteReferences(content: string): InviteReference[] {
  const refs: InviteReference[] = [];
  const seen = new Set<string>();

  for (const match of Array.from(content.matchAll(WEB_URL_PATTERN))) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    const code = inviteCodeFromUrl(url);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    refs.push({ code, url });
  }

  return refs;
}

/** Render ordinary message text as text, but turn web URLs into safe links. */
function LinkedText({ content }: { content: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of Array.from(content.matchAll(WEB_URL_PATTERN))) {
    const start = match.index ?? 0;
    const raw = match[0];
    const url = raw.replace(TRAILING_PUNCTUATION, "");
    const suffix = raw.slice(url.length);

    if (start > cursor) parts.push(content.slice(cursor, start));
    parts.push(
      <a
        key={`${start}:${url}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-emerald-300 underline decoration-emerald-300/35 underline-offset-2 hover:text-emerald-200"
      >
        {url}
      </a>,
    );
    if (suffix) parts.push(suffix);
    cursor = start + raw.length;
  }

  if (cursor < content.length) parts.push(content.slice(cursor));
  return <>{parts}</>;
}

/**
 * Shared renderer for guild messages, DMs and encrypted group messages.
 * Valid invite URLs get a live preview directly below their message text.
 */
export function MessageContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const invites = useMemo(() => inviteReferences(content), [content]);

  return (
    <div className={className}>
      <div className="whitespace-pre-wrap break-words">
        <LinkedText content={content} />
      </div>
      {invites.length > 0 ? (
        <div className="mt-2 flex max-w-[420px] flex-col gap-2">
          {invites.map((invite) => (
            <InviteEmbed key={invite.code} invite={invite} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; preview: InvitePreview }
  | { kind: "unavailable"; message: string };

function InviteEmbed({ invite }: { invite: InviteReference }) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setJoinError(null);

    api.invites.preview(invite.code).then(
      (preview) => {
        if (!cancelled) setState({ kind: "ready", preview });
      },
      (error) => {
        if (cancelled) return;
        setState({
          kind: "unavailable",
          message:
            error instanceof ApiError && error.status === 404
              ? "This invite is no longer available."
              : "The invite preview could not be loaded.",
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [invite.code]);

  if (state.kind === "loading") {
    return (
      <div
        className="flex h-[92px] animate-pulse items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0c0d11]/80 px-4"
        role="status"
        aria-label="Loading invite preview"
      >
        <span className="h-11 w-11 rounded-xl bg-white/[0.07]" />
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-3 w-24 rounded bg-white/[0.07]" />
          <span className="h-4 w-40 rounded bg-white/[0.07]" />
        </span>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <a
        href={invite.url}
        target="_blank"
        rel="noreferrer noopener"
        className="rounded-xl border border-white/[0.07] bg-[#0c0d11]/70 px-4 py-3 text-[12.5px] text-white/45 transition-colors hover:border-white/[0.12] hover:text-white/60"
      >
        {state.message}
      </a>
    );
  }

  const { preview } = state;
  const openGuild = () => {
    window.location.assign(`/client?g=${preview.guildId}`);
  };
  const join = async () => {
    if (joining || preview.expired) return;
    setJoining(true);
    setJoinError(null);
    try {
      const result = await api.invites.accept(invite.code);
      setState({
        kind: "ready",
        preview: { ...preview, alreadyMember: true },
      });
      window.setTimeout(() => {
        window.location.assign(`/client?g=${result.guildId}`);
      }, 250);
    } catch (error) {
      setJoinError(
        error instanceof ApiError
          ? error.message
          : "Could not join this guild. Please try again.",
      );
    } finally {
      setJoining(false);
    }
  };

  const initial = preview.guildName.trim().charAt(0).toUpperCase() || "?";
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#0c0d11]/90 shadow-lg shadow-black/20">
      <div className="h-1 bg-gradient-to-r from-emerald-400/80 via-emerald-300/40 to-transparent" />
      <div className="flex items-center gap-3 p-3.5">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-400/[0.10] text-lg font-semibold text-emerald-300 ring-1 ring-white/[0.06]">
          {preview.guildIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.guildIconUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">
            Guild invite
          </p>
          <p className="truncate text-[15px] font-semibold text-white/90">
            {preview.guildName}
          </p>
          <p className="text-[11.5px] text-white/40">
            {preview.memberCount} member{preview.memberCount === 1 ? "" : "s"}
          </p>
        </div>

        {preview.expired ? (
          <span className="rounded-lg bg-white/[0.05] px-3 py-2 text-[12px] text-white/35">
            Expired
          </span>
        ) : preview.alreadyMember ? (
          <button
            type="button"
            onClick={openGuild}
            className="shrink-0 rounded-lg bg-white px-3.5 py-2 text-[12px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90"
          >
            Open
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void join()}
            disabled={joining}
            className={clsx(
              "shrink-0 rounded-lg bg-emerald-400 px-3.5 py-2 text-[12px] font-medium text-[#07110d] transition-colors hover:bg-emerald-300",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {joining ? "Joining…" : "Join"}
          </button>
        )}
      </div>
      {joinError ? (
        <p
          className="border-t border-white/[0.06] px-3.5 py-2 text-[11.5px] text-rose-300"
          role="alert"
        >
          {joinError}
        </p>
      ) : null}
    </section>
  );
}
