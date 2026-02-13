import type { ClientCommand, ExtensionUiResponse, RpcResponse, ServerEvent } from "../protocol/types.js";

type EventListener = (event: ServerEvent) => void;
type StatusListener = (connected: boolean) => void;

type PendingRequest = {
	resolve: (response: RpcResponse) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
};

const REQUEST_TIMEOUT_MS = 30_000;

export class WsClient {
	private readonly wsUrl: string;
	private readonly log: (...args: unknown[]) => void;
	private readonly warn: (...args: unknown[]) => void;
	private readonly error: (...args: unknown[]) => void;
	private ws: WebSocket | null = null;
	private eventListeners = new Set<EventListener>();
	private statusListeners = new Set<StatusListener>();
	private requestCounter = 0;
	private pendingRequests = new Map<string, PendingRequest>();

	constructor(
		wsUrl: string,
		logger: {
			log: (...args: unknown[]) => void;
			warn: (...args: unknown[]) => void;
			error: (...args: unknown[]) => void;
		},
	) {
		this.wsUrl = wsUrl;
		this.log = logger.log;
		this.warn = logger.warn;
		this.error = logger.error;
	}

	connect(): void {
		if (this.ws) {
			return;
		}

		this.log("connecting to", this.wsUrl);
		const ws = new WebSocket(this.wsUrl);
		this.ws = ws;

		ws.onopen = () => {
			this.log("connected (readyState=", ws.readyState, ")");
			this.emitStatus(true);
		};

		ws.onclose = (event) => {
			this.warn(`disconnected code=${event.code} reason=${event.reason || "none"} wasClean=${event.wasClean}`);
			this.ws = null;
			this.emitStatus(false);
			this.rejectAllPending(new Error("WebSocket disconnected"));
		};

		ws.onerror = (event) => {
			this.error("websocket error", event);
		};

		ws.onmessage = (event) => {
			if (typeof event.data !== "string") {
				this.warn("received non-text frame");
				return;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(event.data);
			} catch (parseError) {
				this.warn("received invalid JSON", parseError);
				return;
			}

			if (!parsed || typeof parsed !== "object") {
				this.warn("received non-object message");
				return;
			}

			const eventObject = parsed as ServerEvent;
			if (eventObject.type === "response" && typeof eventObject.id === "string") {
				const pending = this.pendingRequests.get(eventObject.id);
				if (pending) {
					clearTimeout(pending.timeout);
					this.pendingRequests.delete(eventObject.id);
					pending.resolve(eventObject as RpcResponse);
				}
			}

			for (const listener of this.eventListeners) {
				listener(eventObject);
			}
		};
	}

	disconnect(): void {
		if (!this.ws) {
			return;
		}
		this.ws.close();
		this.ws = null;
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	onEvent(listener: EventListener): () => void {
		this.eventListeners.add(listener);
		return () => {
			this.eventListeners.delete(listener);
		};
	}

	onStatus(listener: StatusListener): () => void {
		this.statusListeners.add(listener);
		return () => {
			this.statusListeners.delete(listener);
		};
	}

	nextRequestId(): string {
		this.requestCounter += 1;
		return `req_${this.requestCounter}`;
	}

	async request(command: ClientCommand): Promise<RpcResponse> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not connected");
		}

		const id = command.id ?? this.nextRequestId();
		const payload: ClientCommand = { ...command, id };

		const promise = new Promise<RpcResponse>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request timed out: ${payload.type}`));
			}, REQUEST_TIMEOUT_MS);

			this.pendingRequests.set(id, { resolve, reject, timeout });
		});

		this.ws.send(JSON.stringify(payload));
		return promise;
	}

	sendExtensionUiResponse(response: ExtensionUiResponse): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not connected");
		}
		this.ws.send(JSON.stringify(response));
	}

	private emitStatus(connected: boolean): void {
		for (const listener of this.statusListeners) {
			listener(connected);
		}
	}

	private rejectAllPending(error: Error): void {
		for (const [requestId, pending] of this.pendingRequests) {
			clearTimeout(pending.timeout);
			pending.reject(error);
			this.pendingRequests.delete(requestId);
		}
	}
}
