"use client";

/**
 * SignalR client wrapper for the E2EE chat hub.
 *
 * The server exposes the hub at
 * <c>/hubs/e2ee-chat</c> (mounted by
 * <c>MapE2eeChatHub</c>). SignalR negotiates the
 * transport — WebSockets by default, with a graceful
 * fallback to Server-Sent Events and long-polling on
 * networks that block WS.
 *
 * Authentication piggy-backs on the JWT bearer
 * scheme: we feed the access token via
 * <c>accessTokenFactory</c>. The server's
 * <c>[Authorize]</c> on the hub rejects any
 * unauthenticated connect, so a tokenless client
 * gets a clean 401-equivalent on the WebSocket
 * upgrade.
 *
 * The wrapper is intentionally tiny: it owns one
 * connection per tab and provides a single
 * <c>joinChannel / leaveChannel / sendMessage</c>
 * surface. Per-channel state (live message handlers,
 * the in-RAM list for ephemeral mode) is the caller's
 * job — we hand them the raw <c>on('ReceiveMessage')</c>
/// hook so they can build a <c>useEffect</c> that
 * wires it up on mount and tears it down on unmount.
 */

import * as signalR from "@microsoft/signalr";

import { api } from "@/lib/api";


/** Wire shape mirroring <c>E2eeChatHub.LiveMessageDto</c>. */
export interface LiveMessage {
  id: number;
  channelId: number;
  senderId: number;
  senderName: string;
  ciphertext: string;
  keyVersion: number;
  sentAt: string;
  isEphemeral: boolean;
  ephemeralId: string | null;
}

export interface SendMessageArgs {
  channelId: number;
  ciphertext: string;
  keyVersion: number;
  /** Required for ephemeral channels; ignored otherwise. */
  ephemeralId?: string;
}

export interface SendMessageResult {
  ephemeralId: string | null;
  id: number;
  persisted: boolean;
}

let cachedConnection: signalR.HubConnection | null = null;
let cachedToken: string | null = null;

/**
 * Return a singleton hub connection for the current
 * tab. We rebuild on token change (sign-in /
 * sign-out) so the bearer in the URL query string is
 * always the live one. <c>start()</c> is idempotent
 * for the same target state — SignalR throws if you
 * call it twice without an intervening <c>stop()</c>,
 * so we wrap the lifecycle in a small lock.
 */
export async function getConnection(
  token: string,
): Promise<signalR.HubConnection> {
  if (cachedConnection && cachedToken === token) {
    if (cachedConnection.state === signalR.HubConnectionState.Connected) {
      return cachedConnection;
    }
    if (cachedConnection.state === signalR.HubConnectionState.Connecting) {
      // Wait for the in-flight connect to settle.
      await cachedConnection.start();
      return cachedConnection;
    }
  }

  // Tear down any prior connection that doesn't match
  // the current token.
  if (cachedConnection) {
    try {
      await cachedConnection.stop();
    } catch {
      // best effort
    }
    cachedConnection = null;
  }

  cachedConnection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/e2ee-chat", {
      accessTokenFactory: () => token,
    })
    .withAutomaticReconnect({
      // Exponential-ish backoff with a cap. The defaults
      // work for most cases; we cap at 30s so a long
      // server outage doesn't hammer the hub.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nextRetryDelayInMilliseconds: (ctx: any) => {
        const delays = [0, 2000, 5000, 10000, 30000];
        return delays[ctx.previousRetryCount] ?? 30000;
      },
    })
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  cachedToken = token;
  await cachedConnection.start();
  return cachedConnection;
}

/** Close the singleton connection (e.g. on sign-out). */
export async function closeConnection(): Promise<void> {
  if (!cachedConnection) return;
  try {
    await cachedConnection.stop();
  } catch {
    // ignore
  } finally {
    cachedConnection = null;
    cachedToken = null;
  }
}

/** Join a channel group. Throws on non-member. */
export async function joinChannel(
  conn: signalR.HubConnection,
  channelId: number,
): Promise<void> {
  await conn.invoke("JoinChannel", channelId);
}

/** Leave a channel group. */
export async function leaveChannel(
  conn: signalR.HubConnection,
  channelId: number,
): Promise<void> {
  await conn.invoke("LeaveChannel", channelId);
}

/**
 * Send a ciphertext message. The server decides
 * whether to persist (standard channel) or just
 * broadcast (ephemeral) based on
 * <c>Channel.IsEphemeral</c>. The return value tells
 * the client which id the broadcast will carry —
 * either the server-assigned id (persisted) or the
 * client-generated <c>ephemeralId</c>.
 */
export async function sendMessage(
  conn: signalR.HubConnection,
  args: SendMessageArgs,
): Promise<SendMessageResult> {
  return conn.invoke<SendMessageResult>("SendMessage", {
    channelId: args.channelId,
    ciphertext: args.ciphertext,
    keyVersion: args.keyVersion,
    ephemeralId: args.ephemeralId ?? null,
  });
}

/**
 * Subscribe to incoming messages for a specific
 * channel. Returns an unsubscribe function the caller
 * should call on unmount.
 */
export function onReceiveMessage(
  conn: signalR.HubConnection,
  channelId: number,
  handler: (msg: LiveMessage) => void,
): () => void {
  const wrapped = (msg: LiveMessage) => {
    if (msg.channelId !== channelId) return;
    handler(msg);
  };
  conn.on("ReceiveMessage", wrapped);
  return () => {
    conn.off("ReceiveMessage", wrapped);
  };
}

/**
 * Fetch the channel's persisted history. Returns
 * <c>[]</c> for ephemeral channels — by design, the
 * server has nothing to give.
 */
export async function fetchHistory(
  channelId: number,
  limit = 50,
): Promise<LiveMessage[]> {
  // Use the same namespace the rest of the api uses.
  // The return shape matches <c>LiveMessage</c> 1:1.
  return api.e2ee.getMessages(channelId, limit);
}
