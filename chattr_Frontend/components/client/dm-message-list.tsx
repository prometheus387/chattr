"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { DmMessage, UserPresence } from "@/types/client";
import { isOnline } from "@/lib/presence";

interface Props {
  /** The other participant in the DM (for the header). */
  other: UserPresence | null;
  messages: DmMessage[];
  className?: string;
  /** Mobile back button — only used on screens below `md`. */
  onBack?: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function DmMessageList({ other, messages, className, onBack }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className={clsx("flex flex-1 flex-col", className)}>
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#0a0b0e] px-4 text-[13.5px] font-semibold text-white/85">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mr-1 grid h-8 w-8 place-items-center rounded text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
            aria-label="Back to direct messages"
            title="Back"
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        <span className="relative grid h-7 w-7 place-items-center rounded-full bg-emerald-400/15 text-[11px] font-semibold text-emerald-200/90">
          {initialOf(other?.displayName || other?.username || "?")}
          <span
            className={clsx(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0b0e]",
              other && isOnline(other) ? "bg-emerald-400" : "bg-white/20",
            )}
            aria-label={other && isOnline(other) ? "online" : "offline"}
          />
        </span>
        <span className="truncate">
          {other?.displayName || other?.username || "Direct message"}
        </span>
        <span className="text-[11px] font-normal text-white/40">
          @{other?.username}
        </span>
      </header>

      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-white/40">
          No messages yet. Say hi!
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ul className="flex flex-col gap-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
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
                        <span className="text-[13.5px] font-semibold text-white/90">
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
      )}
    </div>
  );
}
