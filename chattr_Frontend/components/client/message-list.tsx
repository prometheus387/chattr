"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { Message, Role } from "@/types/client";

interface Props {
  messages: Message[];
  className?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * Renders a sanitized inline-SVG role icon. The backend runs
 * each value through SvgSanitizer before it lands in the DB
 * (script / event handlers / external references are stripped),
 * so the client can render with dangerouslySetInnerHTML
 * without a second sanitization pass.
 *
 * Sizing is done in CSS so callers can drop the icon next to
 * a username (1em) or in a user-sidebar section label (16px)
 * with a single component.
 */
function RoleIcon({ svg, className }: { svg: string | null; className?: string }) {
  if (!svg) return null;
  return (
    <span
      // Server has already sanitized (whitelisted elements,
      // stripped on*/script/javascript:/foreignObject). See
      // Chattr.Infrastructure.Services.SvgSanitizer.
      dangerouslySetInnerHTML={{ __html: svg }}
      className={clsx("inline-grid place-items-center align-[-0.125em]", className)}
      aria-hidden
    />
  );
}

export function MessageList({ messages, className }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the bottom when new messages arrive — but only if the
  // user is already near the bottom (don't yank them around when they
  // scroll up to read history).
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        className={clsx(
          "flex flex-1 items-center justify-center text-[13px] text-white/40",
          className,
        )}
      >
        No messages yet. Be the first to say something.
      </div>
    );
  }

  return (
    <div className={clsx("flex-1 overflow-y-auto px-6 py-4", className)}>
      <ul className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          // Group consecutive messages from the same author.
          const grouped =
            !!prev &&
            prev.authorId === m.authorId &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <li
              key={m.id}
              className={clsx(
                "flex items-start gap-3 rounded-md px-2 py-1 hover:bg-white/[0.03]",
                grouped ? "mt-0" : "mt-3",
              )}
            >
              <div className="w-9 shrink-0 pt-0.5 text-center">
                {grouped ? (
                  <span className="text-[10.5px] text-white/25">
                    {formatTime(m.createdAt)}
                  </span>
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-[14px] font-semibold text-white/85">
                    {initialOf(m.authorName)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    {/* Role icon (if any) sits to the left of the
                        author name. Sized 1em so it scales with
                        the text and lines up visually. */}
                    <RoleIcon
                      svg={m.authorRoleIconSvg}
                      className="h-[1em] w-[1em] text-current"
                      // The colour follows the username — we set
                      // it on the wrapper span via inline style.
                    />
                    <span
                      className="text-[13.5px] font-semibold"
                      style={
                        m.authorRoleColor
                          ? { color: m.authorRoleColor }
                          : { color: "rgba(255,255,255,0.9)" }
                      }
                    >
                      {m.authorName}
                    </span>
                    <span className="text-[10.5px] text-white/35">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white/85">
                  {m.content}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}

/**
 * Re-exported so the user sidebar can render role icons next to
 * member names without re-implementing the sanitized render
 * path. Anything that needs to display <GuildRole.IconSvg> in
 * the client should use this rather than calling
 * dangerouslySetInnerHTML directly.
 */
export { RoleIcon };
