/**
 * WebSocket transport – per-client JSON message framing.
 *
 * Uses the `ws` library for a spec-compliant WebSocket server.
 */

import * as crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer as WsServer } from "ws";

// ============================================================================
// Logging
// ============================================================================

function log(msg: string): void {
	const ts = new Date().toISOString();
	console.error(`[ws ${ts}] ${msg}`);
}

// ============================================================================
// Types
// ============================================================================

export interface WebSocketClient {
	/** Unique client id */
	id: string;
	/** Send a JSON-serialisable object to this client */
	send(data: object): void;
	/** Close the connection */
	close(code?: number, reason?: string): void;
	/** Whether the connection is open */
	isOpen(): boolean;
}

export type MessageHandler = (client: WebSocketClient, data: unknown) => void;
export type CloseHandler = (client: WebSocketClient) => void;

export interface WebSocketServer {
	/** Handle an HTTP upgrade request */
	handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
	/** Register a message handler */
	onMessage(handler: MessageHandler): void;
	/** Register a close handler */
	onClose(handler: CloseHandler): void;
	/** Broadcast a JSON object to all connected clients */
	broadcast(data: object): void;
	/** Number of connected clients */
	clientCount(): number;
	/** Close all connections */
	closeAll(): void;
}

// ============================================================================
// Factory
// ============================================================================

export interface CreateWebSocketServerOptions {
	/** Allowed origin(s) for CORS. Default: none (any origin accepted). */
	allowedOrigins?: string[];
}

export function createWebSocketServer(options?: CreateWebSocketServerOptions): WebSocketServer {
	const wss = new WsServer({ noServer: true });
	const clients = new Map<string, { ws: WebSocket; client: WebSocketClient }>();
	const messageHandlers: MessageHandler[] = [];
	const closeHandlers: CloseHandler[] = [];

	function makeClient(id: string, ws: WebSocket): WebSocketClient {
		return {
			id,
			send(data: object) {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify(data));
				}
			},
			close(code?: number, reason?: string) {
				ws.close(code ?? 1000, reason);
			},
			isOpen() {
				return ws.readyState === WebSocket.OPEN;
			},
		};
	}

	return {
		handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
			const origin = req.headers.origin ?? "none";
			const remoteAddr = (socket as { remoteAddress?: string }).remoteAddress ?? "unknown";

			// Origin check
			if (options?.allowedOrigins && options.allowedOrigins.length > 0) {
				if (!options.allowedOrigins.includes(origin === "none" ? "" : origin)) {
					log(`rejected ${remoteAddr}: disallowed origin "${origin}"`);
					socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
					socket.end();
					return;
				}
			}

			// Delegate the actual upgrade to the ws library
			wss.handleUpgrade(req, socket, head, (ws) => {
				const id = crypto.randomUUID();
				const client = makeClient(id, ws);
				clients.set(id, { ws, client });
				log(`connected ${id} from ${remoteAddr} (origin: ${origin}, clients: ${clients.size})`);

				ws.on("message", (raw) => {
					const text = raw.toString("utf8");
					try {
						const parsed: unknown = JSON.parse(text);
						const cmdType =
							parsed && typeof parsed === "object" && "type" in parsed ? (parsed as { type: string }).type : "?";
						log(`recv ${id} ${cmdType} (${text.length} bytes)`);
						for (const h of messageHandlers) h(client, parsed);
					} catch {
						log(`recv ${id} malformed JSON (${text.length} bytes)`);
					}
				});

				ws.on("close", (code, reason) => {
					log(
						`close ${id} code=${code} reason=${reason.toString("utf8") || "none"} (clients: ${clients.size - 1})`,
					);
					clients.delete(id);
					for (const h of closeHandlers) h(client);
				});

				ws.on("error", (err) => {
					log(`error ${id}: ${err.message}`);
					clients.delete(id);
				});

				ws.on("ping", () => {
					log(`ping ${id}`);
				});
			});
		},

		onMessage(handler: MessageHandler) {
			messageHandlers.push(handler);
		},

		onClose(handler: CloseHandler) {
			closeHandlers.push(handler);
		},

		broadcast(data: object) {
			const eventType = "type" in data ? (data as { type: string }).type : "?";
			const json = JSON.stringify(data);
			let sent = 0;
			for (const { ws } of clients.values()) {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(json);
					sent++;
				}
			}
			log(`broadcast ${eventType} to ${sent}/${clients.size} clients (${json.length} bytes)`);
		},

		clientCount() {
			return clients.size;
		},

		closeAll() {
			log(`closeAll: disconnecting ${clients.size} clients`);
			for (const [id, { ws }] of clients) {
				ws.close(1001, "server shutting down");
				clients.delete(id);
			}
		},
	};
}
