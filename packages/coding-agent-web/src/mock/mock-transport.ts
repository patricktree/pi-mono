import type { ClientCommand, ExtensionUiResponse, RpcResponse, ServerEvent } from "../protocol/types.js";
import type { EventListener, StatusListener, Transport } from "../transport/transport.js";
import type { Scenario } from "./scenarios.js";

/**
 * A mock transport that replays canned event sequences instead of connecting
 * to a real WebSocket server. Activated via `?mock` query parameter.
 */
export class MockTransport implements Transport {
	private readonly scenario: Scenario;
	private readonly log: (...args: unknown[]) => void;
	private connected = false;
	private eventListeners = new Set<EventListener>();
	private statusListeners = new Set<StatusListener>();
	private replayTimers: ReturnType<typeof setTimeout>[] = [];
	private replayActive = false;

	constructor(scenario: Scenario, logger: { log: (...args: unknown[]) => void }) {
		this.scenario = scenario;
		this.log = logger.log;
	}

	connect(): void {
		if (this.connected) {
			return;
		}
		this.log("[mock] connecting...");

		// Simulate async connect
		setTimeout(() => {
			this.connected = true;
			this.log("[mock] connected");
			this.emitStatus(true);
			this.replayPreload();

			// Auto-play: start the replay immediately if the scenario has an autoPrompt
			if (this.scenario.autoPrompt) {
				this.log("[mock] auto-playing scenario");
				this.startReplay();
			}
		}, 150);
	}

	disconnect(): void {
		this.cancelReplay();
		this.connected = false;
		this.emitStatus(false);
		this.log("[mock] disconnected");
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
		const id = command.id ?? "mock_req";

		if (command.type === "prompt") {
			this.log("[mock] received prompt:", command.message);
			// Start replaying the scenario steps
			this.startReplay();
			return {
				type: "response",
				id,
				command: "prompt",
				success: true,
			};
		}

		if (command.type === "abort") {
			this.log("[mock] received abort");
			this.cancelReplay();
			// Emit agent_end if replay was active
			if (this.replayActive) {
				this.replayActive = false;
				this.emitEvent({ type: "agent_end" });
			}
			return {
				type: "response",
				id,
				command: "abort",
				success: true,
			};
		}

		// Exhaustive: all ClientCommand variants handled above
		const _exhaustive: never = command;
		return _exhaustive;
	}

	sendExtensionUiResponse(_response: ExtensionUiResponse): void {
		this.log("[mock] extension UI response (ignored)");
	}

	// -----------------------------------------------------------------------
	// Internal
	// -----------------------------------------------------------------------

	private replayPreload(): void {
		for (const event of this.scenario.preload) {
			this.emitEvent(event);
		}
	}

	private startReplay(): void {
		this.cancelReplay();
		this.replayActive = true;

		let cumulativeDelay = 0;
		for (const step of this.scenario.steps) {
			cumulativeDelay += step.delay;
			const timer = setTimeout(() => {
				if (!this.replayActive) {
					return;
				}
				this.emitEvent(step.event);
				// Detect end of replay
				if (step.event.type === "agent_end") {
					this.replayActive = false;
				}
			}, cumulativeDelay);
			this.replayTimers.push(timer);
		}
	}

	private cancelReplay(): void {
		for (const timer of this.replayTimers) {
			clearTimeout(timer);
		}
		this.replayTimers = [];
	}

	private emitEvent(event: ServerEvent): void {
		for (const listener of this.eventListeners) {
			listener(event);
		}
	}

	private emitStatus(connected: boolean): void {
		for (const listener of this.statusListeners) {
			listener(connected);
		}
	}
}
