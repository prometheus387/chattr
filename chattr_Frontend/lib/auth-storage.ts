/**
 * Tiny localStorage helpers for the JWT. We avoid cookies here to keep the
 * demo self-contained — for production you'd want httpOnly + SameSite=Strict
 * cookies set by the backend so the token never reaches JS.
 */

const TOKEN_KEY = "chattr.auth.token";
const EXPIRES_KEY = "chattr.auth.expiresAt";

export const tokenStorage = {
  read(): { token: string; expiresAt: string } | null {
    if (typeof window === "undefined") return null;
    const token = window.localStorage.getItem(TOKEN_KEY);
    const expiresAt = window.localStorage.getItem(EXPIRES_KEY);
    if (!token || !expiresAt) return null;
    return { token, expiresAt };
  },
  write(token: string, expiresAt: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(EXPIRES_KEY, expiresAt);
  },
  clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(EXPIRES_KEY);
  },
  /** Returns the unix-seconds `exp` claim of the token, or null if invalid. */
  expiresAtUnix(token: string): number | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
      // base64url → base64
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
      const json = JSON.parse(atob(padded)) as { exp?: number };
      return typeof json.exp === "number" ? json.exp : null;
    } catch {
      return null;
    }
  },
  /** True if the token's `exp` claim is in the past (or unparseable). */
  isExpired(token: string, leewaySeconds = 30): boolean {
    const exp = this.expiresAtUnix(token);
    if (exp === null) return true;
    return exp <= Math.floor(Date.now() / 1000) + leewaySeconds;
  },
};
