"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NextLink from "next/link";
import clsx from "clsx";

import { useAuth } from "@/contexts/auth-provider";
import { api } from "@/lib/api";
import { ApiError, type PublicUser } from "@/types/api";
import { Avatar } from "@/components/landing/profile/avatar";
import { PageContainer } from "@/components/landing/page-container";

/* -------------------------------------------------------------------------- */
/*  URL forms                                                                  */
/*    /u/<username>     ┐                                                     */
/*    /user/<username>  ┘──>  /profile/username/<value>                      */
/*    /i/<id>           ┐                                                     */
/*    /id/<id>          ┘──>  /profile/id/<id>                                */
/* -------------------------------------------------------------------------- */

type LookupKind = "username" | "id";

function isPositiveInt(s: string): boolean {
  // Plain decimal digits, no sign, no leading zeros (except the number 0 itself).
  // Matches ASP.NET's :int route constraint semantics.
  return /^(0|[1-9]\d*)$/.test(s);
}

interface PageParams {
  kind: string;
  value: string;
  [key: string]: string;
}

export default function ProfilePage() {
  const params = useParams<PageParams>();
  const router = useRouter();
  const auth = useAuth();

  const kind = (Array.isArray(params.kind) ? params.kind[0] : params.kind) as LookupKind;
  const value = Array.isArray(params.value) ? params.value[0] : params.value;

  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Auth gate: redirect anonymous viewers to /signin --------------------
  useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status !== "authenticated") {
      // Preserve the deep link so the user lands back here post-login.
      const next = encodeURIComponent(
        typeof window !== "undefined" ? window.location.pathname : "/",
      );
      router.replace(`/signin?next=${next}`);
    }
  }, [auth.status, router]);

  // --- Lookup ---------------------------------------------------------------
  useEffect(() => {
    if (auth.status !== "authenticated") return;
    if (!value) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setUser(undefined);

    const lookup = (async () => {
      try {
        if (kind === "id") {
          if (!isPositiveInt(value)) {
            return { kind: "invalid" as const };
          }
          const u = await api.users.getById(Number.parseInt(value, 10));
          return { kind: "ok" as const, user: u };
        }
        if (kind === "username") {
          if (!value.trim()) {
            return { kind: "invalid" as const };
          }
          const u = await api.users.getByUsername(value.trim());
          return { kind: "ok" as const, user: u };
        }
        return { kind: "invalid" as const };
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // Token got rejected — sign out and let the gate redirect.
          auth.signOut();
          return { kind: "auth" as const };
        }
        return { kind: "error" as const, message: err instanceof Error ? err.message : "Unknown error" };
      }
    })();

    lookup.then((result) => {
      if (cancelled) return;
      if (result.kind === "invalid") {
        setError("That doesn't look like a valid profile URL.");
        setUser(null);
      } else if (result.kind === "auth") {
        // signOut triggered a redirect already.
        return;
      } else if (result.kind === "error") {
        setError(result.message);
        setUser(null);
      } else {
        setUser(result.user);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [kind, value, auth, auth.status]);

  // --- Render ---------------------------------------------------------------
  if (auth.status === "loading" || auth.status !== "authenticated") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-white/50">
        Loading session…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-white/50">
        Loading profile…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-rose-300/90">{error}</p>
        <NextLink
          href="/"
          className="text-[12.5px] text-white/55 underline-offset-4 hover:text-emerald-300 hover:underline"
        >
          Back to home
        </NextLink>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-xl font-semibold text-white">User not found</h1>
        <p className="text-sm text-white/50">
          No account matches that {kind}.
        </p>
        <NextLink
          href="/"
          className="text-[12.5px] text-white/55 underline-offset-4 hover:text-emerald-300 hover:underline"
        >
          Back to home
        </NextLink>
      </div>
    );
  }

  if (!user) return null; // shouldn't happen

  const isSelf = auth.user?.id === user.id;
  const canonicalUsername = `/u/${user.username}`;
  const canonicalId = `/i/${user.id}`;
  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <PageContainer>
      <div className="flex flex-col gap-8 py-10">
        <header className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar
            displayName={user.displayName}
            username={user.username}
            avatarUrl={user.avatarUrl}
            size={96}
        />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-semibold tracking-tight text-white">
              {user.displayName}
            </h1>
            {isSelf ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-emerald-300/90">
                You
              </span>
            ) : null}
          </div>
          <p className="text-[14px] text-white/55">@{user.username}</p>
          <p className="mt-1 text-[12.5px] text-white/40">
            Member since {memberSince}
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h2 className="mb-3 text-[12.5px] font-medium uppercase tracking-wider text-white/40">
          Profile links
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-[11.5px] uppercase tracking-wider text-white/35">
              By username
            </dt>
            <dd className="flex items-center gap-2">
              <code className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[12px] text-emerald-300/85">
                {canonicalUsername}
              </code>
              <NextLink
                href={canonicalUsername}
                className="text-[11.5px] text-white/45 underline-offset-4 hover:text-emerald-300 hover:underline"
              >
                open
              </NextLink>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-[11.5px] uppercase tracking-wider text-white/35">
              By id
            </dt>
            <dd className="flex items-center gap-2">
              <code className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[12px] text-emerald-300/85">
                {canonicalId}
              </code>
              <NextLink
                href={canonicalId}
                className="text-[11.5px] text-white/45 underline-offset-4 hover:text-emerald-300 hover:underline"
              >
                open
              </NextLink>
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h2 className="mb-3 text-[12.5px] font-medium uppercase tracking-wider text-white/40">
          Account
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11.5px] uppercase tracking-wider text-white/35">
              User id
            </dt>
            <dd>
              <code
                className={clsx(
                  "break-all rounded bg-white/[0.04] px-1.5 py-0.5 text-[11.5px] text-white/70",
                )}
              >
                {user.id}
              </code>
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11.5px] uppercase tracking-wider text-white/35">
              Username
            </dt>
            <dd className="text-[14px] text-white/80">@{user.username}</dd>
          </div>
        </dl>
      </section>
      </div>
    </PageContainer>
  );
}
