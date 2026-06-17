"use client";

import { useEffect } from "react";

import { maybeRotate, type RotationOutcome } from "@/lib/crypto/rotation";
import { api } from "@/lib/api";

/**
 * Mount this component inside the channel view.
 * On mount, and any time <c>channelId</c> changes, it
 * checks whether the channel's <c>NextRotationUtc</c>
 * has passed and, if so, kicks off the rotation flow
 * in the background.
 *
 * Rotation runs "fire-and-forget" — the user is not
 * blocked. While it's running, the user can keep
 * reading / writing messages with their current
 * (un-rotated) key. Once the new key lands in the
 * store, the MessageList picks it up via
 * <c>useChannelKeyStore().set</c> calls.
 *
 * We swallow every error: a failed rotation is logged
 * and surfaces as a non-fatal skip. The next
 * <c>NextRotationUtc</c> tick is computed by the
 * server, so a transient failure doesn't lock the
 * channel out of rotations.
 */
interface Props {
  channelId: number;
  /**
   * Called when the watcher finishes a rotation pass
   * (success or skip). Use it to show a toast
   * ("Channel keys rotated") or an info message
   * ("3 old messages cleared"). We pass the outcome
   * up rather than rendering in the watcher because
   * the watcher's natural home is a small child of
   * the channel view; toasts typically live at the
   * page level.
   */
  onComplete?: (outcome: RotationOutcome) => void;
}

export function RotationWatcher({ channelId, onComplete }: Props) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const outcome = await maybeRotate(channelId);
      if (cancelled) return;
      onComplete?.(outcome);
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, onComplete]);

  // No JSX. The component is a side-effect-only
  // watcher; nothing to render. Mounting it once per
  // channel-enter is enough.
  return null;
}

/**
 * Helper for non-React callers: returns the
 * <c>NextRotationUtc</c> of a channel as a Date, or
 * <c>null</c> if the request fails. The watcher uses
 * this for the "X minutes until next rotation"
 * display in the channel header (Phase 3+).
 */
export async function fetchNextRotation(channelId: number): Promise<Date | null> {
  try {
    const c = await api.e2ee.getChannel(channelId);
    return new Date(c.nextRotationUtc);
  } catch {
    return null;
  }
}
