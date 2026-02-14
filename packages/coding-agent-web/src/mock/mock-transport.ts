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
	/** Tracks which mock session is "active" for switch_session.
	 *  Starts as a "new" blank session so onConnected auto-resumes the latest one. */
	private activeSessionId = "session_new";

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

		switch (command.type) {
			case "prompt": {
				this.log("[mock] received prompt:", command.message);
				this.startReplay();
				return { type: "response", id, command: "prompt", success: true };
			}

			case "abort": {
				this.log("[mock] received abort");
				this.cancelReplay();
				if (this.replayActive) {
					this.replayActive = false;
					this.emitEvent({ type: "agent_end" });
				}
				return { type: "response", id, command: "abort", success: true };
			}

			case "list_sessions": {
				this.log("[mock] list_sessions");
				return {
					type: "response",
					id,
					command: "list_sessions",
					success: true,
					data: {
						sessions: [
							{
								path: "/tmp/sessions/session_1.json",
								id: "session_1",
								cwd: "/Users/user/workspace/project",
								name: "Refactor auth module",
								created: new Date(Date.now() - 3600_000).toISOString(),
								modified: new Date(Date.now() - 600_000).toISOString(),
								messageCount: 12,
								firstMessage: "Help me refactor the authentication module to use JWT tokens",
							},
							{
								path: "/tmp/sessions/session_2.json",
								id: "session_2",
								cwd: "/Users/user/workspace/project",
								name: "Fix CI pipeline",
								created: new Date(Date.now() - 86400_000).toISOString(),
								modified: new Date(Date.now() - 7200_000).toISOString(),
								messageCount: 8,
								firstMessage: "The CI pipeline is failing on the lint step, can you debug it?",
							},
							{
								path: "/tmp/sessions/session_3.json",
								id: "session_3",
								cwd: "/Users/user/workspace/project",
								created: new Date(Date.now() - 172800_000).toISOString(),
								modified: new Date(Date.now() - 86400_000).toISOString(),
								messageCount: 3,
								firstMessage: "Show me the project structure",
							},
						],
					},
				};
			}

			case "switch_session": {
				this.log("[mock] switch_session:", command.sessionPath);
				const sessionNames: Record<string, string> = {
					session_1: "Refactor auth module",
					session_2: "Fix CI pipeline",
				};
				// Extract session id from path
				for (const sid of ["session_1", "session_2", "session_3"]) {
					if (command.sessionPath.includes(sid)) {
						this.activeSessionId = sid;
						break;
					}
				}
				// Emit session_changed event
				setTimeout(() => {
					this.emitEvent({
						type: "session_changed",
						reason: "switch",
						sessionId: this.activeSessionId,
						sessionName: sessionNames[this.activeSessionId],
					});
				}, 50);
				return { type: "response", id, command: "switch_session", success: true, data: { cancelled: false } };
			}

			case "new_session": {
				this.log("[mock] new_session");
				this.activeSessionId = `session_${Date.now()}`;
				setTimeout(() => {
					this.emitEvent({
						type: "session_changed",
						reason: "new",
						sessionId: this.activeSessionId,
					});
				}, 50);
				return { type: "response", id, command: "new_session", success: true, data: { cancelled: false } };
			}

			case "get_state": {
				this.log("[mock] get_state");
				const sessionNames: Record<string, string> = {
					session_1: "Refactor auth module",
					session_2: "Fix CI pipeline",
				};
				return {
					type: "response",
					id,
					command: "get_state",
					success: true,
					data: {
						sessionId: this.activeSessionId,
						sessionName: sessionNames[this.activeSessionId],
						isStreaming: false,
					},
				};
			}

			case "get_messages": {
				this.log("[mock] get_messages for", this.activeSessionId);
				return {
					type: "response",
					id,
					command: "get_messages",
					success: true,
					data: { messages: getMockMessages(this.activeSessionId) },
				};
			}

			case "get_context_usage": {
				this.log("[mock] get_context_usage");
				return {
					type: "response",
					id,
					command: "get_context_usage",
					success: true,
					data: {
						usage: {
							tokens: 42_000,
							contextWindow: 200_000,
							percent: 21,
						},
					},
				};
			}
		}
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

// ---------------------------------------------------------------------------
// Mock message history per session
// ---------------------------------------------------------------------------

const ASSISTANT_STUB = {
	api: "anthropic" as const,
	provider: "anthropic" as const,
	model: "claude-sonnet-4-20250514",
	usage: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
	stopReason: "stop" as const,
};

function getMockMessages(sessionId: string): unknown[] {
	if (sessionId === "session_1") {
		return [
			{
				role: "user",
				content: "Help me refactor the authentication module to use JWT tokens",
				timestamp: Date.now() - 3600_000,
			},
			{
				role: "assistant",
				content: [{ type: "toolCall", id: "tc_auth_1", name: "read", arguments: { path: "src/auth.ts" } }],
				timestamp: Date.now() - 3599_000,
				...ASSISTANT_STUB,
			},
			{
				role: "toolResult",
				toolCallId: "tc_auth_1",
				toolName: "read",
				content: [
					{
						type: "text",
						text: "import bcrypt from 'bcrypt';\n\nexport function login(user: string, pass: string) {\n  // session-based auth\n  return createSession(user);\n}",
					},
				],
				isError: false,
				timestamp: Date.now() - 3598_000,
			},
			{
				role: "assistant",
				content: [
					{
						type: "text",
						text: "I can see the current auth module uses session-based authentication. Here's my plan to refactor to JWT:\n\n1. Replace `createSession()` with `jwt.sign()` for token generation\n2. Add a `verifyToken()` middleware\n3. Add refresh token support\n\nShall I proceed with the refactor?",
					},
				],
				timestamp: Date.now() - 3597_000,
				...ASSISTANT_STUB,
			},
		];
	}

	if (sessionId === "session_2") {
		return [
			{
				role: "user",
				content: "The CI pipeline is failing on the lint step, can you debug it?",
				timestamp: Date.now() - 7200_000,
			},
			{
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "Let me check the CI config and recent lint errors." },
					{ type: "toolCall", id: "tc_ci_1", name: "read", arguments: { path: ".github/workflows/ci.yml" } },
				],
				timestamp: Date.now() - 7199_000,
				...ASSISTANT_STUB,
			},
			{
				role: "toolResult",
				toolCallId: "tc_ci_1",
				toolName: "read",
				content: [
					{
						type: "text",
						text: "name: CI\non:\n  push:\n    branches: [main]\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run lint",
					},
				],
				isError: false,
				timestamp: Date.now() - 7198_000,
			},
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc_ci_2",
						name: "bash",
						arguments: { command: "npm run lint 2>&1 | tail -20" },
					},
				],
				timestamp: Date.now() - 7197_000,
				...ASSISTANT_STUB,
			},
			{
				role: "toolResult",
				toolCallId: "tc_ci_2",
				toolName: "bash",
				content: [
					{
						type: "text",
						text: "src/utils.ts(14,5): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/handler.ts(28,1): error: Missing semicolon.",
					},
				],
				isError: false,
				timestamp: Date.now() - 7196_000,
			},
			{
				role: "assistant",
				content: [
					{
						type: "text",
						text: "Found 2 lint errors:\n\n1. **src/utils.ts:14** — Type mismatch: assigning `string` to `number`\n2. **src/handler.ts:28** — Missing semicolon\n\nWant me to fix both?",
					},
				],
				timestamp: Date.now() - 7195_000,
				...ASSISTANT_STUB,
			},
		];
	}

	if (sessionId === "session_3") {
		return [
			{
				role: "user",
				content: "Show me the project structure",
				timestamp: Date.now() - 86400_000,
			},
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc_ps_1",
						name: "bash",
						arguments: { command: "find . -maxdepth 2 -type f -name '*.ts' | head -20" },
					},
				],
				timestamp: Date.now() - 86399_000,
				...ASSISTANT_STUB,
			},
			{
				role: "toolResult",
				toolCallId: "tc_ps_1",
				toolName: "bash",
				content: [{ type: "text", text: "./src/index.ts\n./src/utils.ts\n./src/handler.ts\n./test/index.test.ts" }],
				isError: false,
				timestamp: Date.now() - 86398_000,
			},
			{
				role: "assistant",
				content: [
					{
						type: "text",
						text: "Here's the project structure:\n\n```\nsrc/\n  index.ts      — Entry point\n  utils.ts      — Utility functions\n  handler.ts    — Request handler\ntest/\n  index.test.ts — Tests\n```\n\nIt's a simple TypeScript project with 3 source files and 1 test file.",
					},
				],
				timestamp: Date.now() - 86397_000,
				...ASSISTANT_STUB,
			},
		];
	}

	// Default: no messages (new session or unknown)
	return [];
}
