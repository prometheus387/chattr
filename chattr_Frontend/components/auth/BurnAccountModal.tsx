"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Chip,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@heroui/react";

import { api } from "@/lib/api";
import { clearKey, getKeyStoreInstance } from "@/lib/crypto/keyStore";
import { getChannelKeyStoreInstance } from "@/lib/crypto/channelKey";
import { closeConnection } from "@/lib/crypto/signalr";

/**
 * "Burn Account" — the irreversible, one-way
 * destruction of the user's account. The order
 * matters and is non-trivial:
 *
 *   1. User clicks <b>Burn</b>.
 *   2. We close the SignalR connection (so the hub
 *      stops sending us messages and we don't have a
 *      live socket while the server is killing us).
 *   3. We wipe IndexedDB — both the chattr
 *      <c>chattr-secrets-db</c> store (the AES-wrapped
 *      PGP private key) and <b>every other database</b>
 *      in the origin (the spec demands "die gesamte
 *      lokale IndexedDB", not just ours).
 *   4. We lock the in-RAM key stores (so the
 *      React context's <c>unlocked</c> field is null
 *      and the GC can collect the CryptoKey objects
 *      on the next tick).
 *   5. We call the server's <c>DELETE /api/users/me</c>
 *      (Phase 1's <c>BurnAccountHandlers</c>) which
 *      hard-deletes the user row, all their
 *      ciphertexts, and all their wrapped keys.
 *   6. We redirect to <c>/signin</c> with a
 *      <c>?burned=1</c> query param so the login page
 *      can show "Your account has been deleted" and
 *      not the usual "Welcome back" form.
 */
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Phase = "confirm" | "wiping" | "firing" | "error" | "done";

export function BurnAccountModal({ open, onOpenChange }: Props) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhase("confirm");
      setTyped("");
      setError(null);
    }
  }, [open]);

  const onBurn = async () => {
    setError(null);
    setPhase("wiping");

    try {
      // ---- 1. Close the SignalR connection ----------
      // We don't await the SignalR call here because
      // a hung hub would block the local wipe.
      void closeConnection();

      // ---- 2. Wipe local IndexedDB -----------------
      await clearKey();
      if (typeof indexedDB !== "undefined" && "databases" in indexedDB) {
        const dbs = await (indexedDB as IDBFactory & {
          databases(): Promise<{ name?: string }[]>;
        }).databases();
        await Promise.all(
          dbs
            .map((d) => d.name)
            .filter((name): name is string => typeof name === "string")
            .map(
              (name) =>
                new Promise<void>((resolve) => {
                  const req = indexedDB.deleteDatabase(name);
                  req.onsuccess = () => resolve();
                  req.onerror = () => resolve();
                  req.onblocked = () => resolve();
                }),
            ),
        );
      }

      // ---- 3. Lock in-RAM key stores ---------------
      const keyStore = getKeyStoreInstance();
      const channelKeys = getChannelKeyStoreInstance();
      keyStore?.lock();
      channelKeys?.clearAll();

      // ---- 4. Server-side hard delete --------------
      setPhase("firing");
      await api.burnAccount();

      setPhase("done");
      // ---- 5. Redirect ------------------------------
      window.location.href = "/signin?burned=1";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Burn failed.");
      setPhase("error");
    }
  };

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <ModalBackdrop isDismissable={phase === "confirm"} />
      <ModalContainer size="lg" scroll="inside">
        <ModalDialog>
          <ModalHeader className="flex items-center gap-2">
            <span>Burn account</span>
            <Chip color="danger" variant="soft">
              irreversible
            </Chip>
          </ModalHeader>
          <ModalBody className="gap-3">
            {phase === "confirm" ? (
              <ConfirmBody
                typed={typed}
                setTyped={setTyped}
              />
            ) : phase === "wiping" ? (
              <StatusBody
                title="Wiping local storage…"
                detail="Deleting the AES-wrapped PGP key, every IndexedDB database in the origin, and dropping the in-RAM key stores."
              />
            ) : phase === "firing" ? (
              <StatusBody
                title="Firing the server-side hard delete…"
                detail="The server is deleting the user row, every ciphertext, and every wrapped key."
              />
            ) : phase === "error" ? (
              <div className="flex flex-col gap-2">
                <p className="text-danger text-sm" role="alert">
                  {error}
                </p>
                <p className="text-default-500 text-xs">
                  Your local state has already been wiped.
                </p>
              </div>
            ) : (
              <StatusBody
                title="Done. Redirecting…"
                detail="You will land on the sign-in page in a moment."
              />
            )}
          </ModalBody>
          <ModalFooter>
            {phase === "confirm" ? (
              <>
                <Button
                  variant="secondary"
                  onPress={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  isDisabled={typed !== "burn my account"}
                  onPress={() => void onBurn()}
                >
                  Burn
                </Button>
              </>
            ) : phase === "error" ? (
              <>
                <Button
                  variant="secondary"
                  onPress={() => onOpenChange(false)}
                >
                  Close
                </Button>
                <Button
                  variant="danger"
                  onPress={() => void onBurn()}
                >
                  Retry server delete
                </Button>
              </>
            ) : (
              <Button variant="secondary" isDisabled>
                <Spinner size="sm" className="mr-2" /> Working…
              </Button>
            )}
          </ModalFooter>
        </ModalDialog>
      </ModalContainer>
    </Modal>
  );
}

function ConfirmBody({
  typed,
  setTyped,
}: {
  typed: string;
  setTyped: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        This is a one-way, irreversible action. The following
        happens, in order, the moment you click <b>Burn</b>:
      </p>
      <ol className="text-default-500 list-decimal space-y-1 pl-5 text-sm">
        <li>Your SignalR connection closes.</li>
        <li>
          Your local IndexedDB is wiped — including the
          AES-wrapped PGP private key, every other
          database in the origin, and any cached state.
        </li>
        <li>
          The in-RAM key stores (PGP + every channel
          AES key) are dropped; the JavaScript runtime
          is free to garbage-collect them.
        </li>
        <li>
          The server hard-deletes your user row, every
          ciphertext you ever sent, and every wrapped
          key ever stored for you.
        </li>
        <li>You land on the sign-in page.</li>
      </ol>
      <p className="text-default-500 text-sm">
        There is no recovery path. <b>burn my account</b>{" "}
        below to confirm.
      </p>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Type: burn my account"
        className="rounded-md border border-default-300 bg-default-50 px-3 py-2 text-sm outline-none focus:border-primary"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function StatusBody({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Spinner size="sm" className="mt-0.5" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-default-500 text-xs">{detail}</span>
      </div>
    </div>
  );
}
