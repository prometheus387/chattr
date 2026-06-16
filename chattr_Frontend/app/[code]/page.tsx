"use client";

import { useParams } from "next/navigation";

import { InvitePage } from "@/components/client/invite-page";

/**
 * Top-level /<code> route — covers the spec's
 * <c>https://chattr.cc/&lt;invite_code&gt;</c> URL format. We
 * re-use the shared <InvitePage> component so there's exactly
 * one place that handles invite preview/accept.
 *
 * Caveat: this catches ANY single-segment URL, including ones
 * that aren't invites (e.g. a future /about or /pricing). The
 * explicit /signin, /register, /client routes take precedence
 * (Next.js matches static routes before dynamic ones), and the
 * shared page renders a clean "Invite not found" panel when
 * the API returns 404 — so a request to /foo will land here,
 * the preview call will 404, and the user gets a 404-style
 * page. If a new single-segment route is ever added, this
 * will need a guard.
 */
export default function RootInviteRoute() {
  const { code } = useParams<{ code: string }>();
  return <InvitePage code={code ?? ""} />;
}
