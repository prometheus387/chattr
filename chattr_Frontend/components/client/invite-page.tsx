"use client";

import { useCallback, useEffect, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError, type InvitePreview } from "@/types/api";
import { useAuth } from "@/contexts/auth-provider";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; preview: InvitePreview }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/**
 * Shared invite-landing component. Both /invite/[code] and the
 * top-level /[code] route render this — the spec allows either
 * URL format (e.g. <c>https://chattr.cc/invite/&lt;code&gt;</c>
 * or <c>https://chattr.cc/&lt;code&gt;</c>) and we want exactly
 * one place to handle preview/accept logic.
 *
 * The component is auth-aware: anonymous visitors see a "Sign
 * in to accept" CTA that round-trips back here after login.
 * Authenticated visitors who aren't already a member see an
 * "Accept invite" button that joins the guild and routes to
 * /client. Members see a friendly "You're already in" panel
 * that links straight to the guild.
 */
export function InvitePage({ code }: { code: string }) {
  const auth = useAuth();
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // The first preview call goes out the moment the page mounts.
  // At that point the AuthProvider may still be in "loading" —
  // about to read the JWT from localStorage. If we fired the
  // preview before auth resolved, the server would see an
  // anonymous request and answer alreadyMember=false even when
  // the user IS a member, which would make the page show the
  // wrong CTA. We therefore wait one extra tick for the auth
  // provider to settle (it's instant in practice — just one
  // microtask after the localStorage read).
  useEffect(() => {
    if (!code) return;
    if (auth.status === "loading") return;
    let cancelled = false;
    setState({ kind: "loading" });
    setAccepted(false);
    api.invites
      .preview(code)
      .then((preview) => {
        if (cancelled) return;
        setState({ kind: "ready", preview });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: "not-found" });
        } else {
          setState({
            kind: "error",
            message: err instanceof ApiError ? err.message : "Could not load invite.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, auth.status]);

  const onAccept = useCallback(async () => {
    if (!code) return;
    setAccepting(true);
    try {
      const result = await api.invites.accept(code);
      setAccepted(true);
      // Brief pause so the user sees the success state before the
      // route swap. 250ms is enough to read "Joined!" without
      // feeling like a hang.
      window.setTimeout(() => {
        router.replace(`/client?g=${result.guildId}`);
      }, 250);
    } catch (err) {
      if (err instanceof ApiError) {
        // The preview said it was valid; if accept now refuses, the
        // most common reason is that someone revoked it between
        // the two calls. Re-fetch the preview so the UI reflects
        // the new state.
        setState({
          kind: "error",
          message: err.message || "Could not accept the invite.",
        });
      } else {
        setState({ kind: "error", message: "Network error. Please try again." });
      }
    } finally {
      setAccepting(false);
    }
  }, [code, router]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div
        className={clsx(
          "auth-card-enter w-full max-w-[440px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/80 p-7 shadow-2xl shadow-black/60 backdrop-blur-xl",
        )}
      >
        {state.kind === "loading" ? (
          <LoadingPanel />
        ) : state.kind === "not-found" ? (
          <NotFoundPanel />
        ) : state.kind === "error" ? (
          <ErrorPanel message={state.message} />
        ) : state.preview.expired ? (
          <ExpiredPanel preview={state.preview} />
        ) : state.preview.alreadyMember ? (
          <AlreadyMemberPanel preview={state.preview} />
        ) : (
          <AcceptPanel
            preview={state.preview}
            authStatus={auth.status}
            accepting={accepting}
            accepted={accepted}
            onAccept={onAccept}
            onSignIn={() => {
              // Send the user through /signin with a redirect
              // back to this very page so they land on the same
              // accept flow after login.
              const next = encodeURIComponent(
                typeof window !== "undefined"
                  ? `${window.location.pathname}${window.location.search}`
                  : `/invite/${code}`,
              );
              router.push(`/signin?next=${next}`);
            }}
          />
        )}

        <p className="mt-6 text-center text-[11px] uppercase tracking-wider text-white/30">
          Invite code · <span className="font-mono normal-case tracking-normal">{code || "—"}</span>
        </p>
      </div>
    </div>
  );
}

/* ---- per-state panels -------------------------------------------------- */

function LoadingPanel() {
  return (
    <div className="flex flex-col items-center gap-4 py-6" role="status" aria-live="polite">
      <span className="auth-spinner h-6 w-6 rounded-full border-2 border-white/15 border-t-white/70" />
      <p className="text-[13px] text-white/55">Looking up your invite…</p>
    </div>
  );
}

function NotFoundPanel() {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <IconCircle>
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
      </IconCircle>
      <h2 className="text-[18px] font-semibold tracking-tight text-white">
        Invite not found
      </h2>
      <p className="text-[13px] leading-relaxed text-white/55">
        This invite link doesn&apos;t exist or has been revoked. Ask the
        person who sent it to make a fresh one.
      </p>
      <NextLink
        href="/"
        className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
      >
        Back to home
      </NextLink>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <IconCircle tone="danger">
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </IconCircle>
      <h2 className="text-[18px] font-semibold tracking-tight text-white">
        Something went wrong
      </h2>
      <p className="text-[13px] leading-relaxed text-white/55">{message}</p>
    </div>
  );
}

function ExpiredPanel({ preview }: { preview: InvitePreview }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <IconCircle>
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      </IconCircle>
      <h2 className="text-[18px] font-semibold tracking-tight text-white">
        This invite has expired
      </h2>
      <p className="text-[13px] leading-relaxed text-white/55">
        The invite for <span className="font-medium text-white/80">{preview.guildName}</span>{" "}
        is no longer redeemable. Ask a member to generate a new one.
      </p>
    </div>
  );
}

function AlreadyMemberPanel({ preview }: { preview: InvitePreview }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <GuildAvatar name={preview.guildName} iconUrl={preview.guildIconUrl} />
      <div>
        <p className="text-[12px] uppercase tracking-wider text-emerald-300/85">
          You&apos;re already in
        </p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-white">
          {preview.guildName}
        </h2>
        <p className="mt-1 text-[12.5px] text-white/45">
          {preview.memberCount} member{preview.memberCount === 1 ? "" : "s"}
        </p>
      </div>
      <NextLink
        href={`/client?g=${preview.guildId}`}
        className="mt-2 inline-flex h-10 min-w-[160px] items-center justify-center gap-2 rounded-lg bg-white px-4 text-[13px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90"
      >
        Open guild
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </NextLink>
    </div>
  );
}

interface AcceptPanelProps {
  preview: InvitePreview;
  authStatus: "loading" | "anonymous" | "authenticated";
  accepting: boolean;
  accepted: boolean;
  onAccept: () => void;
  onSignIn: () => void;
}

function AcceptPanel({
  preview,
  authStatus,
  accepting,
  accepted,
  onAccept,
  onSignIn,
}: AcceptPanelProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <GuildAvatar name={preview.guildName} iconUrl={preview.guildIconUrl} />
      <div>
        <p className="text-[12px] uppercase tracking-wider text-white/45">
          You&apos;ve been invited to
        </p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-white">
          {preview.guildName}
        </h2>
        <p className="mt-1 text-[12.5px] text-white/45">
          {preview.memberCount} member{preview.memberCount === 1 ? "" : "s"}
        </p>
      </div>

      {authStatus === "loading" ? (
        <div className="mt-2 h-10 w-40 animate-pulse rounded-lg bg-white/[0.04]" />
      ) : authStatus === "anonymous" ? (
        <button
          type="button"
          onClick={onSignIn}
          className="mt-2 inline-flex h-10 min-w-[180px] items-center justify-center gap-2 rounded-lg bg-white px-4 text-[13px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90"
        >
          Sign in to accept
        </button>
      ) : (
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting || accepted}
          className={clsx(
            "group relative mt-2 inline-flex h-10 min-w-[180px] items-center justify-center gap-2 overflow-hidden rounded-lg px-4 text-[13px] font-medium transition-all duration-200",
            accepted
              ? "bg-emerald-400 text-[#0b0c0f]"
              : "bg-white text-[#0b0c0f] hover:bg-white/90",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          <span
            className={clsx(
              "flex items-center gap-2 transition-opacity",
              accepting && "opacity-0",
            )}
          >
            {accepted ? "Joined! Redirecting…" : "Accept invite"}
          </span>
          {accepting ? (
            <span className="absolute inset-0 grid place-items-center">
              <span
                aria-hidden
                className="auth-spinner h-3.5 w-3.5 rounded-full border-2 border-[#0b0c0f]/30 border-t-[#0b0c0f]"
              />
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}

/* ---- shared sub-components -------------------------------------------- */

function IconCircle({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <span
      className={clsx(
        "grid h-12 w-12 place-items-center rounded-full",
        tone === "danger"
          ? "bg-rose-400/[0.08] text-rose-300"
          : "bg-white/[0.04] text-white/70",
      )}
    >
      {children}
    </span>
  );
}

function GuildAvatar({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.04] text-[26px] font-semibold text-emerald-300/90 ring-1 ring-white/[0.06]">
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
