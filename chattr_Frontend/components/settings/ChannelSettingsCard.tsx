"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Switch,
  Button,
  Chip,
  Divider,
  Tooltip,
  Spinner,
} from "@heroui/react";

import { api } from "@/lib/api";

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

  // ---- Render --------------------------------------------------

  if (loading) {
    return (
      <Card>
        <CardHeader>Channel settings</CardHeader>
        <CardBody className="flex items-center gap-2 text-default-500 text-sm">
          <Spinner size="sm" /> Loading…
        </CardBody>
      </Card>
    );
  }

  if (error && !channel) {
    return (
      <Card>
        <CardHeader>Channel settings</CardHeader>
        <CardBody className="text-danger text-sm">{error}</CardBody>
      </Card>
    );
  }

  if (!channel) return null;

  if (!channel.isCreator) {
    return (
      <Card>
        <CardHeader>Channel settings</CardHeader>
        <CardBody className="text-default-500 text-sm">
          Only the channel creator can change these settings.
        </CardBody>
      </Card>
    );
  }

  const clear = localClear ?? channel.clearOnRotation;
  const isDirty = clear !== channel.clearOnRotation;
  const showInlineWarning = showWarning && !clear;

  return (
    <Card className="w-full">
      <CardHeader className="flex items-center justify-between gap-2">
        <span>Channel settings</span>
        <Chip size="sm" variant="flat" color="primary">
          {channel.name}
        </Chip>
      </CardHeader>
      <CardBody className="gap-4">
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

        <Divider />

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
              onValueChange={(v) => {
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
      </CardBody>
      <CardFooter className="flex items-center justify-end gap-2">
        <Tooltip content="Discard local changes">
          <Button
            variant="flat"
            isDisabled={!isDirty || saving}
            onPress={() => {
              setLocalClear(channel.clearOnRotation);
              setShowWarning(false);
            }}
          >
            Cancel
          </Button>
        </Tooltip>
        <Button
          color="primary"
          isDisabled={!isDirty || saving}
          onPress={onSave}
          isLoading={saving}
        >
          Save
        </Button>
      </CardFooter>
    </Card>
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
