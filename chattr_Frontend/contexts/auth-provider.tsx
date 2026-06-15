"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { api, setAuthTokenProvider } from "@/lib/api";
import { ApiError } from "@/types/api";
import { tokenStorage } from "@/lib/auth-storage";
import type {
  PublicUser,
  UserLoginPayload,
  UserRegisterPayload,
} from "@/types/api";

/* -------------------------------------------------------------------------- */
/*  Context shape                                                              */
/* -------------------------------------------------------------------------- */

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface AuthContextType {
  /** Convenience: was a token resolved on mount and is it still valid? */
  isAuthorized: boolean;

  /** More precise state for UI that wants to differentiate "we don't know yet". */
  status: AuthStatus;

  /** The currently signed-in user, or null when not authenticated. */
  user: PublicUser | null;

  /** The raw JWT — exposed for debugging / display. Most code should use api(). */
  token: string | null;

  /** ISO 8601 expiry from the backend (or null when not authenticated). */
  expiresAt: string | null;

  /**
   * Sign in with username + password. Throws ApiError on failure
   * (the calling form should catch it and surface the message).
   */
  signIn: (payload: UserLoginPayload) => Promise<void>;

  /** Create a new account. On success, the user is *not* auto-signed-in. */
  register: (payload: UserRegisterPayload) => Promise<PublicUser>;

  /** Drop the token and clear the in-memory user. Safe to call any time. */
  signOut: () => void;

  /**
   * Re-fetch the current user from `/api/auth/me`. Useful after editing
   * the profile (avatar, display name, etc.). Returns null on failure.
   */
  refreshUser: () => Promise<PublicUser | null>;
}

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                   */
/* -------------------------------------------------------------------------- */

const AuthContextDefaultValues: AuthContextType = {
  isAuthorized: false,
  status: "loading",
  user: null,
  token: null,
  expiresAt: null,
  signIn: async () => {},
  register: async () => {
    throw new Error("AuthProvider not mounted");
  },
  signOut: () => {},
  refreshUser: async () => null,
};

const AuthContext = createContext<AuthContextType>(AuthContextDefaultValues);

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                   */
/* -------------------------------------------------------------------------- */

interface Props {
  children: ReactNode;
}

export function AuthProvider({ children }: Props) {
  // We start in `loading` on the server to avoid hydration mismatches, then
  // resolve the token from localStorage in an effect.
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  // Used to cancel the in-flight /me call when the provider unmounts.
  const abortRef = useRef<AbortController | null>(null);

  // Holds the current token in a ref so the api client (which captures
  // this synchronously at request time) always sees the latest value —
  // not a stale value from when the registration effect first ran.
  const tokenRef = useRef<string | null>(null);

  // -----------------------------------------------------------------
  // Hydrate from localStorage on mount, then validate the token.
  // -----------------------------------------------------------------
  useEffect(() => {
    setAuthTokenProvider(() => tokenRef.current);

    const stored = tokenStorage.read();
    if (!stored) {
      setStatus("anonymous");
      return;
    }

    if (tokenStorage.isExpired(stored.token)) {
      tokenStorage.clear();
      setStatus("anonymous");
      return;
    }

    tokenRef.current = stored.token;
    setToken(stored.token);
    setExpiresAt(stored.expiresAt);

    // Validate the token by hitting /me. If the backend rejects it
    // (e.g. signing key rotated, account deleted) we drop to anonymous.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    api.auth
      .me()
      .then((me) => {
        if (controller.signal.aborted) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          tokenRef.current = null;
          tokenStorage.clear();
          setToken(null);
          setExpiresAt(null);
          setUser(null);
          setStatus("anonymous");
        } else {
          // Network / server hiccup: keep the token, treat as authenticated
          // optimistically. The next request will surface the real problem.
          setStatus("authenticated");
        }
      });

    return () => {
      controller.abort();
    };
    // We intentionally only run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------
  const signIn = useCallback(async (payload: UserLoginPayload) => {
    const res = await api.auth.signIn(payload);
    tokenStorage.write(res.token, res.expiresAt);
    tokenRef.current = res.token;
    setToken(res.token);
    setExpiresAt(res.expiresAt);
    setUser(res.user);
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (payload: UserRegisterPayload) => {
    return api.auth.register(payload);
  }, []);

  const signOut = useCallback(() => {
    tokenStorage.clear();
    tokenRef.current = null;
    setToken(null);
    setExpiresAt(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  // -----------------------------------------------------------------
  // Public value
  // -----------------------------------------------------------------
  const value = useMemo<AuthContextType>(
    () => ({
      isAuthorized: status === "authenticated",
      status,
      user,
      token,
      expiresAt,
      signIn,
      register,
      signOut,
      refreshUser,
    }),
    [status, user, token, expiresAt, signIn, register, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
