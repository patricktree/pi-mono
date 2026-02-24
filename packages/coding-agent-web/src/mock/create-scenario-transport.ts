import type { SetThinkingLevelCommand, SwitchSessionCommand } from "../protocol/types.js";
import { TestTransport } from "../transport/test-transport.js";
import type { Scenario } from "./scenarios.js";

/**
 * Create a `TestTransport` pre-configured for a visual dev scenario.
 *
 * This wires up:
 * - Request handlers with mock session data (session list, messages, state)
 * - Timed scenario replay triggered by `prompt` commands
 * - Abort cancellation of active replays
 * - Async connect with a short delay to simulate WebSocket handshake
 * - Preload events emitted on connect
 * - Auto-play when the scenario has an `autoPrompt`
 *
 * Returns the configured transport, the scenario's `autoPrompt` (if any),
 * and the scenario's `autoSteeringPrompt` (if any) so the caller can
 * display the auto-submitted user and steering messages.
 */
export function createScenarioTransport(
	scenario: Scenario,
	logger: { log: (...args: unknown[]) => void },
): { transport: TestTransport; autoPrompt: string | undefined; autoSteeringPrompt: string | undefined } {
	const transport = new TestTransport();
	let activeSessionId = "session_new";
	let mockThinkingLevel = "medium";

	// -- get_state ------------------------------------------------------------

	transport.handleRequest("get_state", (cmd) => {
		logger.log("[mock] get_state");
		return {
			type: "response",
			id: cmd.id,
			command: "get_state",
			success: true,
			data: {
				sessionId: activeSessionId,
				sessionName: SESSION_NAMES[activeSessionId],
				isStreaming: false,
				thinkingLevel: mockThinkingLevel,
			},
		};
	});

	// -- get_messages ---------------------------------------------------------

	transport.handleRequest("get_messages", (cmd) => {
		logger.log("[mock] get_messages for", activeSessionId);
		return {
			type: "response",
			id: cmd.id,
			command: "get_messages",
			success: true,
			data: { messages: getMockMessages(activeSessionId) },
		};
	});

	// -- get_context_usage ----------------------------------------------------

	transport.handleRequest("get_context_usage", (cmd) => {
		logger.log("[mock] get_context_usage");
		return {
			type: "response",
			id: cmd.id,
			command: "get_context_usage",
			success: true,
			data: {
				usage: { tokens: 42_000, contextWindow: 200_000, percent: 21 },
			},
		};
	});

	// -- set_thinking_level ---------------------------------------------------

	transport.handleRequest("set_thinking_level", (cmd) => {
		const level = (cmd as SetThinkingLevelCommand).level;
		logger.log("[mock] set_thinking_level:", level);
		mockThinkingLevel = level;
		return {
			type: "response",
			id: cmd.id,
			command: "set_thinking_level",
			success: true,
		};
	});

	// -- list_sessions --------------------------------------------------------

	transport.handleRequest("list_sessions", (cmd) => {
		logger.log("[mock] list_sessions");
		if (scenario.emptySessions) {
			return {
				type: "response",
				id: cmd.id,
				command: "list_sessions",
				success: true,
				data: { sessions: [] },
			};
		}
		return {
			type: "response",
			id: cmd.id,
			command: "list_sessions",
			success: true,
			data: { sessions: MOCK_SESSIONS() },
		};
	});

	// -- switch_session -------------------------------------------------------

	transport.handleRequest("switch_session", (cmd) => {
		const sessionPath = (cmd as SwitchSessionCommand).sessionPath;
		logger.log("[mock] switch_session:", sessionPath);

		for (const sid of ["session_1", "session_2", "session_3"]) {
			if (sessionPath.includes(sid)) {
				activeSessionId = sid;
				break;
			}
		}

		setTimeout(() => {
			transport.emitEvent({
				type: "session_changed",
				reason: "switch",
				sessionId: activeSessionId,
				sessionName: SESSION_NAMES[activeSessionId],
			});
		}, 50);

		return {
			type: "response",
			id: cmd.id,
			command: "switch_session",
			success: true,
			data: { cancelled: false },
		};
	});

	// -- new_session ----------------------------------------------------------

	transport.handleRequest("new_session", (cmd) => {
		logger.log("[mock] new_session");
		activeSessionId = `session_${Date.now()}`;

		setTimeout(() => {
			transport.emitEvent({
				type: "session_changed",
				reason: "new",
				sessionId: activeSessionId,
			});
		}, 50);

		return {
			type: "response",
			id: cmd.id,
			command: "new_session",
			success: true,
			data: { cancelled: false },
		};
	});

	// -- prompt ---------------------------------------------------------------

	transport.handleRequest("prompt", (cmd) => {
		logger.log("[mock] received prompt:", (cmd as { message?: string }).message);
		transport.replayWithTiming(scenario.steps);
		return { type: "response", id: cmd.id, command: "prompt", success: true };
	});

	// -- abort ----------------------------------------------------------------

	transport.handleRequest("abort", (cmd) => {
		logger.log("[mock] received abort");
		const wasReplaying = transport.isReplaying;
		transport.cancelReplay();
		if (wasReplaying) {
			transport.emitEvent({ type: "agent_end" });
		}
		return { type: "response", id: cmd.id, command: "abort", success: true };
	});

	// -- connect behavior: async + preload + auto-play ------------------------

	// Override connect to simulate async WebSocket handshake, emit preload
	// events, and auto-play when the scenario defines an autoPrompt.
	const originalConnectAsync = transport.connectAsync.bind(transport);

	// We use onStatus to run post-connect logic once connected.
	transport.onStatus((connected) => {
		if (!connected) return;
		// Emit preload events
		transport.emitEvents(scenario.preload);
		// Auto-play scenario
		if (scenario.autoPrompt) {
			logger.log("[mock] auto-playing scenario");
			transport.replayWithTiming(scenario.steps);
		}
	});

	// Replace connect() with connectAsync() for visual dev realism.
	transport.connect = () => {
		logger.log("[mock] connecting...");
		originalConnectAsync(150);
	};
	// Keep connectAsync available for explicit use.
	transport.connectAsync = (delayMs: number) => {
		logger.log("[mock] connecting...");
		originalConnectAsync(delayMs);
	};

	return { transport, autoPrompt: scenario.autoPrompt, autoSteeringPrompt: scenario.autoSteeringPrompt };
}

// ---------------------------------------------------------------------------
// Mock session data
// ---------------------------------------------------------------------------

const SESSION_NAMES: Record<string, string> = {
	session_1: "Refactor auth module",
	session_2: "Fix CI pipeline",
};

function MOCK_SESSIONS() {
	return [
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
	];
}

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
