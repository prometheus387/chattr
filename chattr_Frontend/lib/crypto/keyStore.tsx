"use client";

/**
 * Module-level singleton ref. Set by the
 * <KeyProvider> on mount, cleared on unmount. Lets
 * non-React callers (event handlers in plain
 * components) reach the key store without the rules-
 * of-hooks restrictions.
 */
let currentInstance: import("./keyStore").KeyStoreValue | null = null;

export function getKeyStoreInstance(): import("./keyStore").KeyStoreValue | null {
  return currentInstance;
}

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
import * as openpgp from "openpgp";

import { generatePgpKeyPair, unlockPrivateKey, type KeyPairBundle } from "./keyGen";
import {
  unwrapPrivateKey,
  wrapPrivateKey,
  type StoredKeyEnvelope,
} from "./wrap";
import { clearKey, loadKey, storeKey } from "./storage";

/**
 * Re-export of <c>clearKey</c> so consumers
 * (BurnAccountModal, settings-card) can wipe the
 * IndexedDB envelope without importing the
 * storage module directly. Keeps the public surface
 * of the key-store module self-contained.
 */
export { clearKey };

/**
 * The shape of the unlocked key as it lives in volatile
 * RAM. Same as Phase 1; lifted verbatim so callers
 * can import from a single module.
 */
export interface UnlockedKey {
  publicKeyArmored: string;
  privateKeyArmored: string;
  privateKey: openpgp.PrivateKey;
  fingerprint: string;
}

export interface KeyStoreValue {
  unlocked: UnlockedKey | null;
  envelope: StoredKeyEnvelope | null;
  hydrating: boolean;
  generate: (userId: string, passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  forget: () => Promise<void>;
  reset: () => Promise<void>;
}

const Context = createContext<KeyStoreValue | null>(null);

export function KeyProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<UnlockedKey | null>(null);
  const [envelope, setEnvelope] = useState<StoredKeyEnvelope | null>(null);
  const [hydrating, setHydrating] = useState(true);

  const hydratedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const e = await loadKey();
        if (cancelled) return;
        setEnvelope(e ?? null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Failed to load PGP key envelope", err);
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setHydrating(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(
    async (userId: string, passphrase: string) => {
      const bundle: KeyPairBundle = await generatePgpKeyPair({
        userId,
        passphrase,
      });
      const wrapped = await wrapPrivateKey(
        bundle.privateKeyArmored,
        passphrase,
      );
      const env: StoredKeyEnvelope = {
        wrapped,
        publicKeyArmored: bundle.publicKeyArmored,
        fingerprint: bundle.fingerprint,
        createdAt: bundle.createdAt,
      };
      await storeKey(env);
      const parsed = await unlockPrivateKey(
        bundle.privateKeyArmored,
        passphrase,
      );
      setEnvelope(env);
      setUnlocked({
        publicKeyArmored: bundle.publicKeyArmored,
        privateKeyArmored: bundle.privateKeyArmored,
        privateKey: parsed as openpgp.PrivateKey,
        fingerprint: bundle.fingerprint,
      });
    },
    [],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!envelope) {
        throw new Error("No key on disk to unlock.");
      }
      const privateKeyArmored = await unwrapPrivateKey(
        envelope.wrapped,
        passphrase,
      );
      const parsed = await unlockPrivateKey(privateKeyArmored, passphrase);
      setUnlocked({
        publicKeyArmored: envelope.publicKeyArmored,
        privateKeyArmored,
        privateKey: parsed as openpgp.PrivateKey,
        fingerprint: envelope.fingerprint,
      });
    },
    [envelope],
  );

  const lock = useCallback(() => {
    setUnlocked(null);
  }, []);

  const forget = useCallback(async () => {
    await clearKey();
    setEnvelope(null);
    setUnlocked(null);
  }, []);

  const reset = useCallback(async () => {
    await clearKey();
    setEnvelope(null);
    setUnlocked(null);
  }, []);

  const value = useMemo<KeyStoreValue>(
    () => ({
      unlocked,
      envelope,
      hydrating,
      generate,
      unlock,
      lock,
      forget,
      reset,
    }),
    [unlocked, envelope, hydrating, generate, unlock, lock, forget, reset],
  );

  // Maintain module-level singleton.
  currentInstance = value;

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useKeyStore(): KeyStoreValue {
  const v = useContext(Context);
  if (!v) {
    throw new Error("useKeyStore must be used inside <KeyProvider>.");
  }
  return v;
}
