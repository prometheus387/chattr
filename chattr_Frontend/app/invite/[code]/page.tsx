"use client";

import { useParams } from "next/navigation";

import { InvitePage } from "@/components/client/invite-page";

/**
 * /invite/[code] — explicit invite-URL format. We re-export
 * the shared <InvitePage> component as a Next.js page. The
 * companion /[code] route renders the same component for the
 * shorter URL format the spec allows.
 */
export default function InviteRoute() {
  const { code } = useParams<{ code: string }>();
  return <InvitePage code={code ?? ""} />;
}
