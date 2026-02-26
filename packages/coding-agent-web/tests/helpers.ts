import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Window type augmentation for page.evaluate callbacks
// Uses broad types since data is JSON-serialized across the Playwright bridge.
// ---------------------------------------------------------------------------

interface PiTestApi {
	setHandler(commandType: string, response: Record<string, unknown>): void;
	removeHandler(commandType: string): void;
	emitEvent(event: Record<string, unknown>): void;
	emitEvents(events: Record<string, unknown>[]): void;
	connect(): void;
	disconnect(): void;
}

declare global {
	interface Window {
		__piTestApi?: PiTestApi;
	}
}

// ---------------------------------------------------------------------------
// Setup options
// ---------------------------------------------------------------------------

export interface MockSession {
	path: string;
	id: string;
	cwd: string;
	name?: string;
	created: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
}

export interface SetupOptions {
	sessionId?: string;
	thinkingLevel?: string;
	sessions?: MockSession[];
	messages?: Record<string, unknown>[];
	contextUsage?: { tokens: number; contextWindow: number; percent: number } | null;
	/** Extra handlers to register. Values are full RPC response objects. */
	handlers?: Record<string, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to `/?test`, configure the TestTransport with the given handlers,
 * and call `connect()`. After this resolves the app is connected with initial
 * data loaded.
 */
export async function setupApp(page: Page, options: SetupOptions = {}): Promise<void> {
	await page.goto("/?test");
	await page.waitForFunction(() => window.__piTestApi !== undefined);

	await page.evaluate((opts) => {
		const api = window.__piTestApi!;

		api.setHandler("get_state", {
			type: "response",
			command: "get_state",
			success: true,
			data: {
				sessionId: opts.sessionId ?? "test-session",
				thinkingLevel: opts.thinkingLevel ?? "medium",
			},
		});

		api.setHandler("list_sessions", {
			type: "response",
			command: "list_sessions",
			success: true,
			data: { sessions: opts.sessions ?? [] },
		});

		api.setHandler("get_messages", {
			type: "response",
			command: "get_messages",
			success: true,
			data: { messages: opts.messages ?? [] },
		});

		api.setHandler("get_context_usage", {
			type: "response",
			command: "get_context_usage",
			success: true,
			data: {
				usage:
					opts.contextUsage === null
						? null
						: (opts.contextUsage ?? { tokens: 1000, contextWindow: 200000, percent: 0.5 }),
			},
		});

		if (opts.handlers) {
			for (const [type, response] of Object.entries(opts.handlers)) {
				api.setHandler(type, response);
			}
		}

		api.connect();
	}, options);

	// Wait for the status listener to fire and React to render
	await page.getByText("Connected").waitFor({ state: "visible" });
}

/**
 * Emit a single server event into the app's transport.
 */
export async function emitEvent(page: Page, event: Record<string, unknown>): Promise<void> {
	await page.evaluate((evt) => {
		window.__piTestApi!.emitEvent(evt);
	}, event);
}

/**
 * Emit multiple server events in order (synchronous, no delays).
 */
export async function emitEvents(page: Page, events: Record<string, unknown>[]): Promise<void> {
	await page.evaluate((evts) => {
		window.__piTestApi!.emitEvents(evts);
	}, events);
}

/**
 * Set (or replace) a handler for a command type at any point during the test.
 */
export async function setHandler(page: Page, commandType: string, response: Record<string, unknown>): Promise<void> {
	await page.evaluate(
		({ type, resp }) => {
			window.__piTestApi!.setHandler(type, resp);
		},
		{ type: commandType, resp: response },
	);
}

// ---------------------------------------------------------------------------
// Event builder helpers (reduce boilerplate in tests)
// ---------------------------------------------------------------------------

const MSG_STUB = { role: "assistant", content: [], timestamp: 0 };

export function agentStart(): Record<string, unknown> {
	return { type: "agent_start" };
}

export function agentEnd(): Record<string, unknown> {
	return { type: "agent_end" };
}

export function textDelta(delta: string): Record<string, unknown> {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "text_delta", delta },
	};
}

export function textEnd(content: string): Record<string, unknown> {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "text_end", content },
	};
}

export function thinkingDelta(delta: string): Record<string, unknown> {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "thinking_delta", delta },
	};
}

export function thinkingEnd(content: string): Record<string, unknown> {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "thinking_end", content },
	};
}

export function toolCallEnd(id: string, name: string, args: Record<string, unknown>): Record<string, unknown> {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: {
			type: "toolcall_end",
			toolCall: { type: "toolCall", id, name, arguments: args },
		},
	};
}

export function toolExecutionStart(toolName: string): Record<string, unknown> {
	return { type: "tool_execution_start", toolName };
}

export function toolExecutionEnd(toolName: string, resultText: string, isError = false): Record<string, unknown> {
	return {
		type: "tool_execution_end",
		toolName,
		result: { content: [{ type: "text", text: resultText }] },
		isError,
	};
}

export function messageEnd(content: Record<string, unknown>[]): Record<string, unknown> {
	return {
		type: "message_end",
		message: { role: "assistant", content, timestamp: Date.now() },
	};
}

export function extensionError(error: string): Record<string, unknown> {
	return { type: "extension_error", error };
}

export function sessionChanged(sessionId: string, reason: string, sessionName?: string): Record<string, unknown> {
	return { type: "session_changed", reason, sessionId, sessionName };
}

/** Shorthand for a successful RPC response. */
export function successResponse(command: string, data?: unknown): Record<string, unknown> {
	return {
		type: "response",
		command,
		success: true,
		...(data !== undefined ? { data } : {}),
	};
}
