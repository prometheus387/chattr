"use client";

import { useState, type FormEvent } from "react";

interface Props {
  disabled?: boolean;
  onSend: (content: string) => Promise<void> | void;
  placeholder?: string;
}

export function MessageInput({ disabled, onSend, placeholder }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="border-t border-white/[0.06] bg-[#0a0b0e] px-6 py-3"
    >
      <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 transition-colors focus-within:border-white/20">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(e as unknown as FormEvent);
            }
          }}
          placeholder={placeholder ?? "Message"}
          rows={1}
          disabled={disabled || sending}
          className="flex-1 resize-none bg-transparent text-[14px] text-white placeholder-white/30 outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || sending || value.trim().length === 0}
          className="rounded-md bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#0b0c0f] transition-opacity disabled:opacity-40"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="mt-1.5 text-[10.5px] text-white/30">
        <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 text-[9.5px]">Enter</kbd> to send, <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 text-[9.5px]">Shift+Enter</kbd> for new line
      </p>
    </form>
  );
}
