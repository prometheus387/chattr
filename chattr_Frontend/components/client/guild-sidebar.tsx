"use client";

import clsx from "clsx";
import type { GuildSummary } from "@/types/client";

interface Props {
  guilds: GuildSummary[];
  activeGuildId: number | null;
  onSelect: (guildId: number) => void;
  onHome: () => void;
  /** When true, the home/friends icon is the active selection. */
  homeActive: boolean;
  className?: string;
}

export function GuildSidebar({
  guilds,
  activeGuildId,
  onSelect,
  onHome,
  homeActive,
  className,
}: Props) {
  return (
    <aside
      className={clsx(
        "flex w-[68px] shrink-0 flex-col items-center gap-2 border-r border-white/[0.06] bg-[#07080b] py-3",
        className,
      )}
    >
      <HomeButton active={homeActive} onClick={onHome} />
      {guilds.length > 0 && <Divider />}
      {guilds.map((g) => (
        <GuildButton
          key={g.id}
          guild={g}
          active={g.id === activeGuildId}
          onClick={() => onSelect(g.id)}
        />
      ))}
    </aside>
  );
}

function HomeButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Direct messages"
      aria-label="Open direct messages"
      aria-pressed={active}
      className="group relative flex h-12 w-12 items-center justify-center"
    >
      <span
        aria-hidden
        className={clsx(
          "absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all duration-150",
          active
            ? "h-6 opacity-100"
            : "h-2 opacity-0 group-hover:h-4 group-hover:opacity-60",
        )}
      />
      <span
        className={clsx(
          "flex h-12 w-12 items-center justify-center rounded-2xl text-[16px] font-semibold transition-all duration-150",
          active
            ? "rounded-xl bg-emerald-400 text-[#0b0c0f]"
            : "bg-white/[0.07] text-emerald-300/85 group-hover:rounded-xl group-hover:bg-emerald-400 group-hover:text-[#0b0c0f]",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a2 2 0 0 1-2-2v-1" />
          <path d="M2 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 4V6z" />
        </svg>
      </span>
    </button>
  );
}

function Divider() {
  return <div className="h-0.5 w-8 rounded-full bg-white/[0.07]" />;
}

function GuildButton({
  guild,
  active,
  onClick,
}: {
  guild: GuildSummary;
  active: boolean;
  onClick: () => void;
}) {
  const initial = (guild.name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <button
      type="button"
      onClick={onClick}
      title={guild.name}
      className="group relative flex h-12 w-12 items-center justify-center"
      aria-label={`Open ${guild.name}`}
      aria-pressed={active}
    >
      <span
        aria-hidden
        className={clsx(
          "absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all duration-150",
          active ? "h-6 opacity-100" : "h-2 opacity-0 group-hover:h-4 group-hover:opacity-60",
        )}
      />
      <span
        className={clsx(
          "flex h-12 w-12 items-center justify-center rounded-2xl text-[16px] font-semibold transition-all duration-150",
          active
            ? "rounded-xl bg-emerald-400 text-[#0b0c0f]"
            : "bg-white/[0.07] text-white/85 group-hover:rounded-xl group-hover:bg-emerald-400 group-hover:text-[#0b0c0f]",
        )}
      >
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guild.iconUrl}
            alt=""
            className="h-full w-full rounded-inherit object-cover"
          />
        ) : (
          initial
        )}
      </span>
    </button>
  );
}
