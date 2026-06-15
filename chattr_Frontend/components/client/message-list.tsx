"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { Message } from "@/types/client";

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
  );
}
