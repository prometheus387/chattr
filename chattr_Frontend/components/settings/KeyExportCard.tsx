"use client";

import { useState } from "react";
import {
  Card,
  Button,
  Chip,
  Code,
  Tooltip,
} from "@heroui/react";

import { useKeyStore } from "@/lib/crypto/keyStore";

/**
 * Settings card that lets the user export their
 * decrypted private PGP key as a <c>.asc</c> file.
 *
 * Why this exists: even with the at-rest wrap (see
 * <c>wrap.ts</c>) the user is one passphrase leak or
 * one IndexedDB wipe away from being unable to read
 * their own messages. The export is the recovery path
 * — they take the file, store it on a USB stick or
 * print it, and as long as they still remember the
 * passphrase, they can rebuild the key on a new
 * device with <c>import</c> (TBD in a follow-up card).
 *
 * The export only works while the key is unlocked in
 * RAM — that's the whole point. The "Locked" state
 * shows a help message and a disabled button. The
 * "Unlocked" state shows the fingerprint, the key
 * type, and the download button.
 */
export function KeyExportCard() {
  const { unlocked, envelope, hydrating, lock, reset } = useKeyStore();
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!unlocked) return;
    setError(null);
    setDownloading(true);
    try {
      const armored = unlocked.privateKeyArmored;
      // .asc is the conventional PGP extension; we use
      // application/pgp-keys as the content type so the
      // browser offers "Open with GPG" in the download
      // dialog on Linux/macOS.
      const blob = new Blob([armored], { type: "application/pgp-keys" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chattr-${unlocked.fingerprint.slice(-16)}.asc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so the browser has time to start
      // the download. revoking too early cancels it on
      // some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  };

  // ---- Loading state --------------------------------------------------
  if (hydrating) {
    return (
      <Card className="w-full">
        <Card.Header>Private key</Card.Header>
        <Card.Content>
          <p className="text-default-500 text-sm">Loading key envelope…</p>
        </Card.Content>
      </Card>
    );
  }

  // ---- No key on this device -----------------------------------------
  if (!envelope) {
    return (
      <Card className="w-full">
        <Card.Header>Private key</Card.Header>
        <Card.Content>
          <p className="text-default-500 text-sm">
            No PGP key on this device. Generate one in the Key Setup
            card above to enable E2EE.
          </p>
        </Card.Content>
      </Card>
    );
  }

  // ---- Locked state ---------------------------------------------------
  if (!unlocked) {
    return (
      <Card className="w-full">
        <Card.Header className="flex items-center justify-between gap-2">
          <span>Private key</span>
          <Chip size="sm" variant="soft" color="warning">
            Locked
          </Chip>
        </Card.Header>
        <Card.Content>
          <p className="text-default-500 text-sm">
            Unlock the key in the Key Setup card above to enable
            export. Exporting requires the in-RAM key — we never
            write the plaintext to disk in any code path.
          </p>
          <p className="mt-2 text-default-400 text-xs">
            Fingerprint on file:{" "}
            <Code className="text-xs">{envelope.fingerprint}</Code>
          </p>
        </Card.Content>
      </Card>
    );
  }

  // ---- Unlocked: show full details + download -------------------------
  return (
    <Card className="w-full">
      <Card.Header className="flex items-center justify-between gap-2">
        <span>Private key</span>
        <Chip size="sm" variant="soft" color="success">
          Unlocked
        </Chip>
      </Card.Header>
      <Card.Content className="gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-default-500 text-xs uppercase tracking-wide">
            Fingerprint
          </span>
          <Code className="text-xs break-all">{unlocked.fingerprint}</Code>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-default-500 text-xs uppercase tracking-wide">
            Algorithm
          </span>
          <span className="text-sm">Curve25519 (ed25519 + x25519)</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-default-500 text-xs uppercase tracking-wide">
            Created
          </span>
          <span className="text-sm">
            {new Date(envelope.createdAt).toLocaleString()}
          </span>
        </div>
        {error ? (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div role="separator" className="my-2 h-px w-full bg-default-200/40" />
        <p className="text-default-500 text-xs">
          Exports the ASCII-armored private key. Anyone with this
          file and your passphrase can read every message
          addressed to this key. Treat it like a password.
        </p>
      </Card.Content>
      <Card.Footer className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <Button
            variant="primary"
            onPress={() => {
              setConfirming(true);
            }}
            isDisabled={downloading}
          >
            Export private key
          </Button>
          <Tooltip.Content>
            Download your decrypted PGP private key as a .asc file
          </Tooltip.Content>
        </Tooltip>
        <Tooltip>
          <Button variant="secondary" onPress={lock} isDisabled={downloading}>
            Lock
          </Button>
          <Tooltip.Content>
            Remove the in-RAM key. The on-disk copy stays wrapped;
            you can unlock it again with your passphrase.
          </Tooltip.Content>
        </Tooltip>
        <Tooltip>
          <Button
            variant="secondary"
            onPress={reset}
            isDisabled={downloading}
          >
            Forget key
          </Button>
          <Tooltip.Content>
            Forget this key on this device. Removes both the disk
            copy and the RAM copy. Use only if you&apos;ve exported
            a backup.
          </Tooltip.Content>
        </Tooltip>
      </Card.Footer>

      {/* Confirm modal — the file contains the private
          key in a form that grants full access to your
          account. The user should pause before clicking
          through. */}
      {confirming ? (
        <ExportConfirm
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            setConfirming(false);
            await handleDownload();
          }}
        />
      ) : null}
    </Card>
  );
}

/**
 * Confirm dialog before downloading the private key.
 * Split out for testability and to keep the parent
 * component readable.
 */
function ExportConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-[460px] rounded-2xl border border-warning-300/30 bg-[#0c0d11]/95 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Export private key?</h3>
        <p className="mt-2 text-sm text-default-500">
          The downloaded <code className="text-default-700">.asc</code>{" "}
          file holds your decrypted private key. Anyone who has the
          file <b>and</b> your passphrase can read your messages and
          impersonate you. Store it offline (USB stick, paper
          backup) and never upload it anywhere.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onPress={() => void onConfirm()}>
            Download anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
