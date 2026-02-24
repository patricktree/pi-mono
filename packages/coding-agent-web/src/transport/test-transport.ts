import type { ClientCommand, ExtensionUiResponse, RpcResponse, ServerEvent } from "../protocol/types.js";
import type { EventListener, StatusListener, Transport } from "./transport.js";

/**
 * A single step in a timed replay sequence.
 */
export interface ReplayStep {
	/** Milliseconds to wait before emitting this event (relative to previous step). */
	delay: number;
	event: ServerEvent;
}

/**
 * Handler that receives a command and returns a response.
 * Returning `undefined` falls through to the default "unhandled" error response.
 */
export type RequestHandler = (command: ClientCommand) => RpcResponse | undefined;

/**
 * Recorded entry for a `request()` call.
 */
export interface RecordedRequest {
	command: ClientCommand;
	response: RpcResponse;
}

/**
 * A test-oriented transport that also serves as the mock transport for visual
 * dev mode. Provides:
 *
 * - Instant or async connect
 * - Per-command-type request handlers (configurable per test)
 * - Full recording of all `request()` calls and `sendExtensionUiResponse()` calls
 * - Programmatic `emitEvent()` to push server events into listeners
 * - Timed replay of event sequences (for visual dev / demo scenarios)
 *
 * Usage (tests):
 * ```ts
 * const transport = new TestTransport();
 * transport.handleRequest("get_state", (cmd) => ({
 *   type: "response", id: cmd.id, command: "get_state", success: true,
 *   data: { sessionId: "s1", isStreaming: false },
 * }));
 * transport.connect();
 * transport.emitEvent({ type: "agent_start" });
 * ```
 *
 * Usage (visual dev — see `createScenarioTransport()`):
 * ```ts
 * const transport = new TestTransport();
 * // ... register handlers ...
 * transport.connectAsync(150);
 * transport.replayWithTiming(scenario.steps);
 * ```
 */
export class TestTransport implements Transport {
	private connected = false;
	private eventListeners = new Set<EventListener>();
	private statusListeners = new Set<StatusListener>();

	private requestHandlers = new Map<string, RequestHandler>();

	private replayTimers: ReturnType<typeof setTimeout>[] = [];
	private replayActive = false;

	/** All `request()` calls in order, with the response that was returned. */
	readonly requests: RecordedRequest[] = [];

	/** All `sendExtensionUiResponse()` calls in order. */
	readonly extensionUiResponses: ExtensionUiResponse[] = [];

	// ---------------------------------------------------------------------------
	// Transport interface
	// ---------------------------------------------------------------------------

	/** Connect synchronously (instant). */
	connect(): void {
		if (this.connected) {
			return;
		}
		this.connected = true;
		this.emitStatus(true);
	}

	disconnect(): void {
		this.cancelReplay();
		if (!this.connected) {
			return;
		}
		this.connected = false;
		this.emitStatus(false);
	}

	isConnected(): boolean {
		return this.connected;
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

	async request(command: ClientCommand): Promise<RpcResponse> {
		const handler = this.requestHandlers.get(command.type);

		const response: RpcResponse = handler?.(command) ?? {
			type: "response",
			id: command.id,
			command: command.type,
			success: false,
			error: `TestTransport: no handler registered for "${command.type}"`,
		};

		this.requests.push({ command, response });
		return response;
	}

	sendExtensionUiResponse(response: ExtensionUiResponse): void {
		this.extensionUiResponses.push(response);
	}

	// ---------------------------------------------------------------------------
	// Test API — handler registration
	// ---------------------------------------------------------------------------

	/**
	 * Register a handler for a specific command type.
	 * Replaces any previously registered handler for that type.
	 */
	handleRequest(commandType: string, handler: RequestHandler): void {
		this.requestHandlers.set(commandType, handler);
	}

	/**
	 * Remove the handler for a specific command type.
	 */
	removeHandler(commandType: string): void {
		this.requestHandlers.delete(commandType);
	}

	// ---------------------------------------------------------------------------
	// Test API — emit events (synchronous)
	// ---------------------------------------------------------------------------

	/**
	 * Push a server event to all registered event listeners (synchronous).
	 */
	emitEvent(event: ServerEvent): void {
		for (const listener of this.eventListeners) {
			listener(event);
		}
	}

	/**
	 * Emit a sequence of server events in order (synchronous, no delays).
	 */
	emitEvents(events: ServerEvent[]): void {
		for (const event of events) {
			this.emitEvent(event);
		}
	}

	// ---------------------------------------------------------------------------
	// Timed replay (for visual dev / demo scenarios)
	// ---------------------------------------------------------------------------

	/**
	 * Connect after a delay, simulating an async WebSocket handshake.
	 * Useful for visual dev mode; tests should use `connect()` instead.
	 */
	connectAsync(delayMs: number): void {
		if (this.connected) {
			return;
		}
		const timer = setTimeout(() => {
			this.connected = true;
			this.emitStatus(true);
		}, delayMs);
		this.replayTimers.push(timer);
	}

	/**
	 * Replay a sequence of steps with their specified delays.
	 * Each step's `delay` is relative to the previous step.
	 * Cancels any previously active replay.
	 */
	replayWithTiming(steps: ReplayStep[]): void {
		this.cancelReplay();
		this.replayActive = true;

		let cumulativeDelay = 0;
		for (const step of steps) {
			cumulativeDelay += step.delay;
			const timer = setTimeout(() => {
				if (!this.replayActive) {
					return;
				}
				this.emitEvent(step.event);
				if (step.event.type === "agent_end") {
					this.replayActive = false;
				}
			}, cumulativeDelay);
			this.replayTimers.push(timer);
		}
	}

	/**
	 * Whether a timed replay is currently active.
	 */
	get isReplaying(): boolean {
		return this.replayActive;
	}

	/**
	 * Cancel any active timed replay and clear all pending timers.
	 */
	cancelReplay(): void {
		for (const timer of this.replayTimers) {
			clearTimeout(timer);
		}
		this.replayTimers = [];
		this.replayActive = false;
	}

	// ---------------------------------------------------------------------------
	// Test API — assertions / inspection
	// ---------------------------------------------------------------------------

	/**
	 * Return all recorded requests matching a given command type.
	 */
	requestsOfType<T extends ClientCommand["type"]>(
		type: T,
	): Array<RecordedRequest & { command: Extract<ClientCommand, { type: T }> }> {
		return this.requests.filter(
			(r): r is RecordedRequest & { command: Extract<ClientCommand, { type: T }> } => r.command.type === type,
		);
	}

	/**
	 * Clear all recorded requests and extension UI responses.
	 */
	reset(): void {
		this.requests.length = 0;
		this.extensionUiResponses.length = 0;
	}

	// ---------------------------------------------------------------------------
	// Internal
	// ---------------------------------------------------------------------------

	private emitStatus(connected: boolean): void {
		for (const listener of this.statusListeners) {
			listener(connected);
		}
	}
}
