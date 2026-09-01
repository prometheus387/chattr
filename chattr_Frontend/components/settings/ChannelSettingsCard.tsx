"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Switch,
  Button,
  Chip,
  Tooltip,
  Spinner,
} from "@heroui/react";

import { api } from "@/lib/api";
import {
  rotateChannelKey,
  type RotationMode,
  type RotationProgress,
} from "@/lib/crypto/rotation";

/**
 * Channel settings card (HeroUI). Phase-2 spec: the
 * "Clear on rotation" toggle, with the exact
 * warning text the user demanded when deactivating:
 *
 *   "Warnung: Das zieht ultra an deinen ressourcen"
 *
 * The warning is rendered as an inline
 * <c>WarningBanner</c> right below the toggle the
 * moment the user un-checks it. We re-show the same
 * banner in the save-confirm dialog so a user who
 * closes the banner accidentally still gets the
 * warning before the round-trip.
 *
 * Only the channel creator sees this card. The server
 * rejects the PATCH with 403 otherwise, and the
 * channel-info endpoint returns <c>isCreator</c> so we
 * can render a read-only "you're not the creator"
 * state instead of an editable form.
 */
interface Props {
  channelId: number;
  /** Toast / setNotification callback the page can
   *  plug in (Phase 2's rotation flow uses it; we
   *  forward rotation outcomes through it). */
  onNotify?: (kind: "info" | "warning" | "error", message: string) => void;
}

export function ChannelSettingsCard({ channelId, onNotify }: Props) {
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Local working copy of ClearOnRotation. Lets the
   *  warning banner react instantly to the toggle
   *  before the server round-trip. */
  const [localClear, setLocalClear] = useState<boolean | null>(null);
  /** True after the user has explicitly un-checked
   *  ClearOnRotation. Reset on save / cancel. */
  const [showWarning, setShowWarning] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotationMode, setRotationMode] = useState<RotationMode>("reencrypt");
  const [rotating, setRotating] = useState(false);
  const [rotationProgress, setRotationProgress] =
    useState<RotationProgress | null>(null);

  // ---- Load channel metadata on mount -------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const c = await api.e2ee.getChannel(channelId);
        if (cancelled) return;
        setChannel(c);
        setLocalClear(c.clearOnRotation);
        setShowWarning(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load channel.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // ---- Save ----------------------------------------------------
  const onSave = async () => {
    if (!channel || localClear === null) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.e2ee.updateChannel(channelId, {
        clearOnRotation: localClear,
      });
      setChannel((prev) => (prev ? { ...prev, ...updated } : prev));
      // Reset the warning once the user has committed.
      setShowWarning(false);
      onNotify?.("info", "Channel settings saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setError(msg);
      onNotify?.("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const onRotate = async () => {
    setRotating(true);
    setRotationProgress(null);
    setError(null);
    const outcome = await rotateChannelKey(
      channelId,
      rotationMode,
      setRotationProgress,
    );
    if (outcome.kind === "rotated") {
      const updated = await api.e2ee.getChannel(channelId);
      setChannel(updated);
      setLocalClear(updated.clearOnRotation);
      setRotateOpen(false);
      onNotify?.(
        "info",
        rotationMode === "delete"
          ? `Key rotated. ${outcome.deletedMessages} old messages deleted.`
          : `Key rotated. ${outcome.reencryptedMessages} messages re-encrypted locally.`,
      );
    } else if (outcome.kind === "skipped") {
      setError(outcome.reason);
      onNotify?.("error", outcome.reason);
    }
    setRotating(false);
  };

  // ---- Render --------------------------------------------------

  if (loading) {
    return (
      <Card>
        <Card.Header>Channel settings</Card.Header>
        <Card.Content className="flex items-center gap-2 text-default-500 text-sm">
          <Spinner size="sm" /> Loading…
        </Card.Content>
      </Card>
    );
  }

  if (error && !channel) {
    return (
      <Card>
        <Card.Header>Channel settings</Card.Header>
        <Card.Content className="text-danger text-sm">{error}</Card.Content>
      </Card>
    );
  }

  if (!channel) return null;

  if (!channel.isCreator) {
    return (
      <Card>
        <Card.Header>Channel settings</Card.Header>
        <Card.Content className="text-default-500 text-sm">
          Only the channel creator can change these settings.
        </Card.Content>
      </Card>
    );
  }

  const clear = localClear ?? channel.clearOnRotation;
  const isDirty = clear !== channel.clearOnRotation;
  const showInlineWarning = showWarning && !clear;

  return (
    <>
    <Card className="w-full">
      <Card.Header className="flex items-center justify-between gap-2">
        <span>Channel settings</span>
        <Chip size="sm" variant="soft" color="accent">
          {channel.name}
        </Chip>
      </Card.Header>
      <Card.Content className="gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-default-500 text-xs uppercase tracking-wide">
            Rotation
          </span>
          <span className="text-sm">
            Next scheduled:{" "}
            <span className="text-default-700 font-mono">
              {new Date(channel.nextRotationUtc).toLocaleString()}
            </span>
          </span>
          <span className="text-default-400 text-xs">
            Interval: {channel.rotationInterval}
          </span>
        </div>

        <div role="separator" className="h-px w-full bg-default-200/40" />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                Clear messages on rotation
              </span>
              <span className="text-default-500 text-xs">
                Wipes the channel's ciphertext history each time the
                AES key rotates. Saves disk space; loses the old
                history (which is already un-decryptable).
              </span>
            </div>
            <Switch
              isSelected={clear}
              onChange={(v: boolean) => {
                setLocalClear(v);
                setShowWarning(!v);
              }}
              isDisabled={saving}
            />
          </div>

          {/* Inline warning: the exact string the spec
              asked for. Surfaced immediately when the
              user un-checks the switch so the choice
              doesn't go unnoticed. */}
          {showInlineWarning ? (
            <div
              role="alert"
              className="mt-1 rounded-md border border-warning-300/40 bg-warning-300/[0.08] px-3 py-2 text-warning-200 text-[12.5px] leading-relaxed"
            >
              <b>Warnung: Das zieht ultra an deinen ressourcen</b>
              <p className="mt-0.5 text-warning-100/70 text-[11.5px]">
                Old ciphertext accumulates on disk because the previous
                key is gone and can't decrypt it. Saving server
                resources, costing local storage and bandwidth.
              </p>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </Card.Content>
      <Card.Footer className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          isDisabled={saving || rotating}
          onPress={() => setRotateOpen(true)}
        >
          Rotate key
        </Button>
        <Tooltip>
          <Button
            variant="secondary"
            isDisabled={!isDirty || saving}
            onPress={() => {
              setLocalClear(channel.clearOnRotation);
              setShowWarning(false);
            }}
          >
            Cancel
          </Button>
          <Tooltip.Content>Discard local changes</Tooltip.Content>
        </Tooltip>
        <Button
          variant="primary"
          isDisabled={!isDirty || saving}
          onPress={onSave}
        >
          {saving ? <Spinner size="sm" /> : null}
          Save
        </Button>
      </Card.Footer>
    </Card>
    {rotateOpen ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rotate-key-title"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !rotating) {
            setRotateOpen(false);
          }
        }}
      >
        <div className="w-full max-w-[520px] rounded-lg border border-white/[0.09] bg-[#0c0d11] shadow-2xl shadow-black/70">
          <div className="border-b border-white/[0.07] px-5 py-4">
            <h3 id="rotate-key-title" className="text-[16px] font-semibold text-white">
              Rotate AES key
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-white/50">
              A new AES-256 key is generated locally and wrapped separately for every member.
            </p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <button
              type="button"
              disabled={rotating}
              onClick={() => setRotationMode("delete")}
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                rotationMode === "delete"
                  ? "border-rose-300/40 bg-rose-400/[0.08]"
                  : "border-white/[0.08] hover:bg-white/[0.03]"
              }`}
            >
              <span className="block text-[13px] font-medium text-white/90">
                Rotate and delete old messages
              </span>
              <span className="mt-1 block text-[11.5px] leading-relaxed text-white/45">
                Permanently deletes the complete encrypted history. This cannot be undone.
              </span>
            </button>
            <button
              type="button"
              disabled={rotating}
              onClick={() => setRotationMode("reencrypt")}
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                rotationMode === "reencrypt"
                  ? "border-amber-300/40 bg-amber-400/[0.08]"
                  : "border-white/[0.08] hover:bg-white/[0.03]"
              }`}
            >
              <span className="block text-[13px] font-medium text-white/90">
                Rotate and re-encrypt old messages
              </span>
              <span className="mt-1 block text-[11.5px] leading-relaxed text-white/45">
                Downloads the ciphertext history, decrypts it locally and encrypts it again with the new key.
              </span>
            </button>
            <div role="alert" className="rounded-md border border-amber-300/30 bg-amber-400/[0.07] px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-100/85">
              <b>Warning:</b> This operation may take some time and use significant CPU, memory and bandwidth. Keep this tab open until it finishes.
            </div>
            {rotationProgress ? (
              <p className="text-[11.5px] tabular-nums text-white/55">
                {rotationProgress.phase === "loading"
                  ? `Loading history: ${rotationProgress.completed} messages`
                  : rotationProgress.phase === "reencrypting"
                    ? `Re-encrypting locally: ${rotationProgress.completed} / ${rotationProgress.total}`
                    : "Uploading encrypted result..."}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
            <button
              type="button"
              disabled={rotating}
              onClick={() => setRotateOpen(false)}
              className="h-9 rounded-md px-3 text-[12.5px] text-white/65 hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={rotating}
              onClick={() => void onRotate()}
              className="h-9 min-w-[110px] rounded-md bg-white px-3 text-[12.5px] font-medium text-[#0b0c0f] disabled:opacity-50"
            >
              {rotating ? "Rotating..." : "Rotate key"}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

interface ChannelDetail {
  id: number;
  name: string;
  isEphemeral: boolean;
  rotationInterval: string;
  nextRotationUtc: string;
  clearOnRotation: boolean;
  createdByUserId: number;
  createdAt: string;
  isCreator: boolean;
}
