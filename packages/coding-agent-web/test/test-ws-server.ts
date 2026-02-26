import { type WebSocket, WebSocketServer } from "ws";
import type { ClientCommand, RpcResponse, RpcResponseDataMap, ServerEvent } from "../src/protocol/types.js";

/** Per-command success bodies: includes `data` only for commands that carry data. */
type RpcSuccessBodies = {
	[C in ClientCommand["type"]]: RpcResponseDataMap[C] extends undefined
		? { command: C; success: true }
		: { command: C; success: true; data: RpcResponseDataMap[C] };
};

/** RPC response body without `id` and `type` — the server injects those. */
export type RpcResponseBody =
	| RpcSuccessBodies[ClientCommand["type"]]
	| { command: ClientCommand["type"]; success: false; error: string };

/** Narrow `RpcResponseBody` to the variants for a specific command type. */
export type RpcResponseBodyFor<C extends ClientCommand["type"]> =
	| Extract<RpcResponseBody, { command: C; success: true }>
	| Extract<RpcResponseBody, { success: false }>;

/**
 * Response handler: receives the parsed client command and returns a response
 * body. The server wraps it with `id` (from the command) and `type: "response"`.
 */
export type RequestHandler<T extends ClientCommand["type"] = ClientCommand["type"]> = (
	command: Extract<ClientCommand, { type: T }>,
) => RpcResponseBodyFor<T>;

/**
 * A lightweight WebSocket server for E2E tests.
 *
 * - Listens on an OS-assigned port (port 0).
 * - Accepts one client connection at a time.
 * - Routes incoming RPC commands to registered handlers by `command.type`.
 * - Exposes `emitEvent()` / `emitEvents()` to push server events to the client.
 * - Worker-scoped: one server per Playwright worker, shared across tests.
 */
export class TestWsServer {
	private wss: WebSocketServer;
	private client: WebSocket | null = null;
	private handlers = new Map<ClientCommand["type"], RequestHandler>();
	private _port: number;

	private constructor(wss: WebSocketServer, port: number) {
		this.wss = wss;
		this._port = port;

		wss.on("connection", (ws) => {
			this.client = ws;

			ws.on("message", (data) => {
				const raw = typeof data === "string" ? data : data.toString("utf-8");
				let command: ClientCommand;
				try {
					command = JSON.parse(raw) as ClientCommand;
				} catch {
					return;
				}

				if (!command.type) {
					return;
				}

				const handler = this.handlers.get(command.type);
				if (!handler) {
					const errorResponse: RpcResponse = {
						type: "response",
						id: command.id,
						command: command.type,
						success: false,
						error: `TestWsServer: no handler for "${command.type}"`,
					};
					ws.send(JSON.stringify(errorResponse));
					return;
				}

				const body = handler(command);
				ws.send(JSON.stringify({ ...body, id: command.id, type: "response" }));
			});

			ws.on("close", () => {
				if (this.client === ws) {
					this.client = null;
				}
			});
		});
	}

	/** The port the server is listening on. */
	get port(): number {
		return this._port;
	}

	/** The `ws://` URL tests should pass to the app via `?ws=`. */
	get url(): string {
		return `ws://127.0.0.1:${this._port}`;
	}

	/**
	 * Create and start a new server. Resolves once it's listening.
	 */
	static async create(): Promise<TestWsServer> {
		return new Promise<TestWsServer>((resolve, reject) => {
			const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
			wss.on("listening", () => {
				const addr = wss.address();
				const port = addr !== null && typeof addr === "object" ? addr.port : 0;
				resolve(new TestWsServer(wss, port));
			});
			wss.on("error", reject);
		});
	}

	/**
	 * Register a handler for a command type. The handler receives the full
	 * parsed command and returns the response body (without `id` or `type`).
	 */
	setHandler<T extends ClientCommand["type"]>(commandType: T, handler: RequestHandler<T>): void {
		// The map stores the general RequestHandler type; the generic signature
		// on this method guarantees callers pass a correctly-narrowed handler.
		this.handlers.set(commandType, handler as unknown as RequestHandler);
	}

	/**
	 * Convenience: register a handler that always returns a static response body.
	 */
	setStaticHandler<C extends ClientCommand["type"]>(commandType: C, response: RpcResponseBodyFor<C>): void {
		this.handlers.set(commandType, (() => response) as unknown as RequestHandler);
	}

	/**
	 * Remove the handler for a command type.
	 */
	removeHandler(commandType: ClientCommand["type"]): void {
		this.handlers.delete(commandType);
	}

	/**
	 * Remove all registered handlers. Called between tests when the server
	 * is worker-scoped to prevent handler leakage.
	 */
	clearHandlers(): void {
		this.handlers.clear();
	}

	/**
	 * Send a server event to the connected client.
	 */
	emitEvent(event: ServerEvent): void {
		if (!this.client || this.client.readyState !== this.client.OPEN) {
			throw new Error("TestWsServer: no connected client");
		}
		this.client.send(JSON.stringify(event));
	}

	/**
	 * Send multiple server events in order.
	 */
	emitEvents(events: ServerEvent[]): void {
		for (const event of events) {
			this.emitEvent(event);
		}
	}

	/**
	 * Close the server and all connections. Force-terminates any connected
	 * clients first so `wss.close()` doesn't block waiting for graceful shutdown.
	 */
	async close(): Promise<void> {
		// Terminate all connected clients immediately
		for (const client of this.wss.clients) {
			client.terminate();
		}
		this.client = null;

		return new Promise<void>((resolve, reject) => {
			this.wss.close((err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
}
