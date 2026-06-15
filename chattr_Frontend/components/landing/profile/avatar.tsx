"use client";

/**
 * Small avatar with a deterministic initials fallback. The fallback is
 * used when the user has no `avatarUrl` set — most users, on signup.
 */
interface AvatarProps {
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  size?: number;
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // First non-whitespace char of the first two whitespace-separated tokens.
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase() || trimmed[0].toUpperCase();
}

// Deterministic color so the same user always gets the same fallback.
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 60% 55%)`;
}

export function Avatar({ displayName, username, avatarUrl, size = 96 }: AvatarProps) {
  const dim = { width: size, height: size, fontSize: size * 0.4 };
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={`${displayName} avatar`}
        className="rounded-full border border-white/[0.08] object-cover"
        style={dim}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${displayName} avatar`}
      className="grid place-items-center rounded-full border border-white/[0.08] font-semibold text-white/85"
      style={{
        ...dim,
        background: `linear-gradient(135deg, ${colorFor(username)} 0%, ${colorFor(username + "x")} 100%)`,
      }}
    >
      {initialsOf(displayName)}
    </div>
  );
}
