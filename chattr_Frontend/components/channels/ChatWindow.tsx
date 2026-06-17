"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Chip,
  Spinner,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@heroui/react";

import { useKeyStore } from "@/lib/crypto/keyStore";
import { useChannelKeyStore } from "@/lib/crypto/channelKey";
import {
  decryptMessage,
  encryptMessage,
  newEphemeralId,
} from "@/lib/crypto/aes-gcm";
import {
  fetchHistory,
  getConnection,
  joinChannel,
  leaveChannel,
  onReceiveMessage,
  sendMessage,
  type LiveMessage,
} from "@/lib/crypto/signalr";
/**
 * HeroUI chat window. Two modes:
 * <list type="bullet">
 *   <item>Standard channel (<c>isEphemeral=false</c>):
 *         on mount, the component fetches up to 50
 *         historical messages, decrypts each, and
 *         renders them. Live messages from the hub
 *         append to the same list. The list is
 *         persistent within the lifetime of the
 *         component (channel switch unmounts it).</item>
 *   <item>Ephemeral channel (<c>isEphemeral=true</c>):
 *         on mount, NO history is loaded. Live messages
 *         populate the in-RAM list as they arrive. On
 *         unmount or page reload, the list evaporates
 *         — exactly per spec.</item>
 * </list>
 */
interface ChannelInfo {
  id: number;
  name: string;
  isEphemeral: boolean;
  isCreator: boolean;
}

interface DecryptedMessage {
  /** For standard: server id. For ephemeral: ephemeralId. */
  id: string;
  channelId: number;
  senderId: number;
  senderName: string;
  /** Plaintext. The component never re-encrypts. */
  text: string;
  sentAt: Date;
  isEphemeral: boolean;
}

interface Props {
  channel: ChannelInfo;
  /** Current user's id (used for "is this my message?" highlight). */
  currentUserId: number;
  /** Auth bearer; the hub's <c>accessTokenFactory</c> pulls from this. */
  authToken: string;
}

export function ChatWindow({ channel, currentUserId, authToken }: Props) {
  const keyStore = useKeyStore();
  const channelKeys = useChannelKeyStore();

  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the last channel id we mounted for, so we
  // can drop the previous SignalR subscription when
  // the parent swaps the channel prop.
  const lastChannelIdRef = useRef<number | null>(null);
  // Map<ciphertext, plaintext> cache for the duration
  // of the channel mount. Standard channels: we re-
  // decrypt each historical message once; ephemeral:
  // we never re-decrypt because the list is gone on
  // unmount.
  const decryptCacheRef = useRef<Map<string, string>>(new Map());

  // ---- Channel enter / leave -----------------------------------
  useEffect(() => {
    if (lastChannelIdRef.current === channel.id) return;
    lastChannelIdRef.current = channel.id;
    setMessages([]);
    setError(null);
    setLoading(true);
    decryptCacheRef.current = new Map();

    let unsub: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        // Ensure the channel's AES key is in RAM.
        const stored = await channelKeys.ensureUnlocked(channel.id);
        if (!stored) {
          setError(
            "Channel key not unlocked. Open the channel as a member first or unlock your PGP key.",
          );
          setLoading(false);
          return;
        }

        // Connect to the hub. One shared connection per
        // tab — the signalr.ts helper caches it.
        const conn = await getConnection(authToken);

        // Join this channel's group.
        await joinChannel(conn, channel.id);

        // Subscribe to incoming messages.
        unsub = onReceiveMessage(conn, channel.id, (msg) => {
          if (cancelled) return;
          void handleIncoming(msg, stored.key);
        });

        // Load history (standard channels only).
        if (!channel.isEphemeral) {
          try {
            const history = await fetchHistory(channel.id, 50);
            const decrypted = await Promise.all(
              history
                .filter((m) => m.keyVersion === stored.version)
                .map((m) =>
                  decryptAndConvert(m, stored.key, decryptCacheRef.current),
                ),
            );
            if (!cancelled) {
              setMessages(decrypted);
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("Failed to load history:", err);
          }
        }
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to connect.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
      // Leave the channel group on unmount so the
      // hub stops sending us messages. The shared
      // connection is reused by other channels in
      // the same tab.
      void (async () => {
        try {
          const conn = await getConnection(authToken);
          await leaveChannel(conn, channel.id);
        } catch {
          // best effort
        }
      })();
      // Ephemeral-mode invariant: when the user
      // leaves an ephemeral channel, the in-RAM
      // list is gone. We don't have to do anything
      // because the next render starts with a fresh
      // state — but make the intent explicit.
      if (channel.isEphemeral) {
        setMessages([]);
        decryptCacheRef.current = new Map();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, channel.isEphemeral, authToken]);

  // ---- Incoming-message handler ---------------------------------
  const handleIncoming = useCallback(
    async (msg: LiveMessage, key: CryptoKey) => {
      try {
        const text = await decryptAndConvert(
          msg,
          key,
          decryptCacheRef.current,
        );
        setMessages((prev) => {
          // Dedup by stable id (ephemeral: ephemeralId;
          // standard: server id as string).
          const id = msg.isEphemeral
            ? `e:${msg.ephemeralId ?? ""}`
            : `s:${msg.id}`;
          if (prev.some((m) => m.id === id)) return prev;
          return [...prev, text];
        });
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: msg.isEphemeral
              ? `e:${msg.ephemeralId ?? ""}`
              : `s:${msg.id}`,
            channelId: msg.channelId,
            senderId: msg.senderId,
            senderName: msg.senderName,
            text: "[decrypt failed — wrong key version?]",
            sentAt: new Date(msg.sentAt),
            isEphemeral: msg.isEphemeral,
          },
        ]);
      }
    },
    [],
  );

  // ---- Send handler ---------------------------------------------
  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    const stored = channelKeys.keys.get(channel.id);
    if (!stored) {
      setError("Channel key not in RAM.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const ciphertext = await encryptMessage(text, stored.key);
      const ephemeralId = channel.isEphemeral ? newEphemeralId() : undefined;
      const conn = await getConnection(authToken);
      await sendMessage(conn, {
        channelId: channel.id,
        ciphertext,
        keyVersion: stored.version,
        ephemeralId,
      });
      // We do NOT add the message locally — the
      // hub broadcasts it back to us, the receive
      // handler decrypts, dedupes, and renders.
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }, [draft, channel.id, channel.isEphemeral, channelKeys.keys, authToken]);

  // ---- Render ---------------------------------------------------
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{channel.name}</span>
          {channel.isEphemeral ? (
            <Chip color="warning" variant="soft">
              Ephemeral · no history
            </Chip>
          ) : null}
        </div>
        <Chip color="default" variant="soft">
          {channel.isEphemeral
            ? "Self-destruct on leave"
            : "Standard (encrypted history)"}
        </Chip>
      </CardHeader>
      <Card.Content className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-default-500 text-sm">
            <Spinner size="sm" /> Connecting…
          </div>
        ) : error ? (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-default-400 text-sm">
            {channel.isEphemeral
              ? "No messages yet. Anything you send is live-only."
              : "No messages yet. Be the first to write."}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.senderId === currentUserId
                    ? "flex flex-col items-end"
                    : "flex flex-col items-start"
                }
              >
                <div className="flex items-baseline gap-2 text-default-500 text-xs">
                  <span className="font-medium">{m.senderName}</span>
                  <span>{m.sentAt.toLocaleTimeString()}</span>
                  {m.isEphemeral ? (
                    <Tooltip>
                      <TooltipTrigger>
                        <Chip color="warning" variant="soft">
                          ephemeral
                        </Chip>
                      </TooltipTrigger>
                      <TooltipContent>
                        Self-destroyed when you leave this channel
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
                <div
                  className={
                    m.senderId === currentUserId
                      ? "rounded-2xl bg-primary-500/20 px-3 py-1.5 text-sm"
                      : "rounded-2xl bg-default-100 px-3 py-1.5 text-sm"
                  }
                >
                  {m.text}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
      <CardFooter className="flex items-end gap-2">
        <textarea
          value={draft}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) => setDraft(e.target.value)}
          placeholder={
            channel.isEphemeral
              ? "Type a message — it's gone when you leave."
              : "Type a message…"
          }
          rows={1}

          disabled={sending || !keyStore.unlocked}
          className="flex-1 rounded-md border border-default-300 bg-default-50 px-3 py-2 text-sm outline-none focus:border-primary resize-none"
        />
        <Button
          variant="primary"
          isDisabled={sending || !draft.trim() || !keyStore.unlocked}
          onPress={() => void onSend()}
        >
          Send
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---- Helpers ---------------------------------------------------------

async function decryptAndConvert(
  msg: LiveMessage,
  key: CryptoKey,
  cache: Map<string, string>,
): Promise<DecryptedMessage> {
  const cacheKey = `${msg.channelId}:${msg.id || msg.ephemeralId}`;
  let text = cache.get(cacheKey);
  if (text === undefined) {
    text = await decryptMessage(msg.ciphertext, key);
    cache.set(cacheKey, text);
  }
  return {
    id: msg.isEphemeral
      ? `e:${msg.ephemeralId ?? ""}`
      : `s:${msg.id}`,
    channelId: msg.channelId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    text,
    sentAt: new Date(msg.sentAt),
    isEphemeral: msg.isEphemeral,
  };
}

/**
 * Re-export of <c>closeConnection</c> so non-React
 * callers (e.g. the BurnAccountModal) can tear the
 * hub down without importing the lib/crypto/
 * directory directly.
 */
export { closeConnection } from "@/lib/crypto/signalr";
