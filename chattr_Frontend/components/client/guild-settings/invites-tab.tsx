"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

import { useAuth } from "@/contexts/auth-provider";
import { api } from "@/lib/api";
import { ApiError, type GuildInvite } from "@/types/api";
import type { GuildMember, GuildSummary, Role } from "@/types/client";
import { MemberContextMenu } from "./member-context-menu";

interface Props {
  guild: GuildSummary;
  members: GuildMember[] | null;
  roles: Role[] | null;
  onDataChanged: () => void;
}

export function InvitesTab({ guild, members, roles, onDataChanged }: Props) {
  const auth = useAuth();
  const [invites, setInvites] = useState<GuildInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [issuerMenu, setIssuerMenu] = useState<{
    member: GuildMember;
    isCurrentMember: boolean;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInvites(null);
    setError(null);

    void api.guildInvites.list(guild.id).then(
      (result) => {
        if (!cancelled) setInvites(result);
      },
      (err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.status === 403
              ? "You don't have permission to view this guild's invites."
              : err.message || "Could not load invites."
            : "Network error.",
        );
        setInvites([]);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [guild.id]);

  const copyInvite = async (invite: GuildInvite) => {
    const url = `${window.location.origin}/invite/${invite.code}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedId(invite.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === invite.id ? null : current));
      }, 1_500);
    } catch {
      setError("The invite link could not be copied.");
    }
  };

  const memberList = members ?? [];
  const roleList = roles ?? [];
  const viewerId = auth.user?.id ?? -1;
  const viewerMember = memberList.find((member) => member.userId === viewerId);
  const viewerRole = viewerMember
    ? roleList.find((role) => role.id === viewerMember.roleId)
    : undefined;
  const viewerCanMoveAnyone =
    guild.isOwner ||
    guild.isAdministrator ||
    viewerRole?.permissions.isAdministrator === true;
  const viewerPosition = viewerRole?.position ?? 0;
  const untargetableIds = new Set<number>();
  for (const member of memberList) {
    if (member.isOwner) {
      untargetableIds.add(member.userId);
      continue;
    }
    if (viewerCanMoveAnyone) continue;
    const memberRole = roleList.find((role) => role.id === member.roleId);
    if (memberRole && memberRole.position >= viewerPosition) {
      untargetableIds.add(member.userId);
    }
  }

  const profileUrl = (username: string) => `/u/${encodeURIComponent(username)}`;

  const openIssuerMenu = (invite: GuildInvite, x: number, y: number) => {
    const currentMember = memberList.find(
      (member) => member.userId === invite.issuedById,
    );
    setIssuerMenu({
      member: currentMember ?? {
        userId: invite.issuedById,
        username: invite.issuedByUsername,
        displayName: invite.issuedByUsername,
        avatarUrl: null,
        roleId: 0,
        roleName: "",
        roleColor: "",
        roleIconSvg: null,
        isOwner: false,
        isAdministrator: false,
        joinedAt: invite.createdAt,
      },
      isCurrentMember: !!currentMember,
      x,
      y,
    });
  };

  if (invites === null) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-white/45">
        <span
          aria-hidden
          className="auth-spinner h-3.5 w-3.5 rounded-full border-2 border-white/15 border-t-white/60"
        />
        Loading invites...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[12px] text-rose-200/90"
        >
          {error}
        </p>
      ) : null}

      {invites.length === 0 ? (
        <div className="border-y border-white/[0.06] py-10 text-center">
          <p className="text-[13px] text-white/55">No invite links yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-white/[0.06]">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead className="border-b border-white/[0.06] text-[10.5px] uppercase tracking-wider text-white/35">
              <tr>
                <th className="px-3 py-2.5 font-medium">Invite link</th>
                <th className="px-3 py-2.5 font-medium">Created by</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
                <th className="px-3 py-2.5 font-medium">Uses</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="w-12 px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => {
                const inviteUrl = `${window.location.origin}/invite/${invite.code}`;
                const createdAt = new Date(invite.createdAt);
                const useLabel =
                  invite.unlimitedUse || invite.maxUse === null
                    ? String(invite.useCount)
                    : `${invite.useCount} / ${invite.maxUse}`;

                return (
                  <tr
                    key={invite.id}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a, button"))
                        return;
                      window.location.assign(
                        profileUrl(invite.issuedByUsername),
                      );
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      const issuer = event.currentTarget.querySelector(
                        "[data-invite-issuer]",
                      );
                      const rect = issuer?.getBoundingClientRect();
                      openIssuerMenu(
                        invite,
                        rect ? rect.right + 8 : event.clientX,
                        rect ? rect.top : event.clientY,
                      );
                    }}
                    className="cursor-pointer border-b border-white/[0.04] transition-colors last:border-b-0 hover:bg-white/[0.025]"
                  >
                    <td className="max-w-[260px] px-3 py-3">
                      <a
                        href={inviteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-mono text-[11.5px] text-white/75 hover:text-white hover:underline"
                        title={inviteUrl}
                      >
                        {inviteUrl}
                      </a>
                    </td>
                    <td className="px-3 py-3 text-white/70">
                      <a
                        data-invite-issuer
                        href={profileUrl(invite.issuedByUsername)}
                        className="hover:text-white hover:underline"
                        title={`Open profile for user ID ${invite.issuedById}`}
                      >
                        @{invite.issuedByUsername}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-white/50">
                      <time
                        dateTime={invite.createdAt}
                        title={createdAt.toLocaleString()}
                      >
                        {createdAt.toLocaleDateString()}
                      </time>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-white/75">
                      {useLabel}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx(
                          "inline-flex rounded px-1.5 py-0.5 text-[10.5px] font-medium",
                          invite.expired
                            ? "bg-white/[0.05] text-white/40"
                            : "bg-emerald-400/[0.10] text-emerald-200/85",
                        )}
                      >
                        {invite.expired ? "Expired" : "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void copyInvite(invite)}
                        aria-label={`Copy invite created by ${invite.issuedByUsername}`}
                        title={
                          copiedId === invite.id ? "Copied" : "Copy invite link"
                        }
                        className={clsx(
                          "grid h-8 w-8 place-items-center rounded-md transition-colors",
                          copiedId === invite.id
                            ? "bg-emerald-400/[0.12] text-emerald-200"
                            : "text-white/45 hover:bg-white/[0.06] hover:text-white",
                        )}
                      >
                        {copiedId === invite.id ? <CheckIcon /> : <CopyIcon />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-white/35">
        {invites.length} {invites.length === 1 ? "invite link" : "invite links"}
      </p>

      {issuerMenu ? (
        <MemberContextMenu
          position={{ x: issuerMenu.x, y: issuerMenu.y }}
          member={issuerMenu.member}
          guild={guild}
          roles={roleList}
          untargetableIds={untargetableIds}
          viewerUserId={viewerId}
          viewer={{
            canAssign:
              issuerMenu.isCurrentMember &&
              (guild.isOwner || guild.isAdministrator || guild.canManageRoles),
            canKick: issuerMenu.isCurrentMember && guild.canKickMembers,
            canBan: guild.canBanMembers,
          }}
          onClose={() => setIssuerMenu(null)}
          onChanged={() => {
            setIssuerMenu(null);
            onDataChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
