import type { Page } from "@playwright/test";
import type {
	AgentEndEvent,
	AgentStartEvent,
	AssistantMessage,
	BashResult,
	ClientCommand,
	ContextUsage,
	ExtensionErrorEvent,
	HistoryMessage,
	MessageEndEvent,
	MessageUpdateEvent,
	ServerEvent,
	SessionChangedEvent,
	SessionSummary,
	ToolCallContent,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
} from "../src/protocol/types.js";
import type { RpcResponseBody, TestWsServer } from "./test-ws-server.js";

// ---------------------------------------------------------------------------
// Setup options
// ---------------------------------------------------------------------------

export interface SetupOptions {
	sessionId?: string;
	thinkingLevel?: string;
	sessions?: SessionSummary[];
	messages?: HistoryMessage[];
	contextUsage?: ContextUsage | null;
	/** Extra handlers keyed by command type. Values are RPC response bodies. */
	handlers?: Partial<Record<ClientCommand["type"], RpcResponseBody>>;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Configure the server with default handlers, navigate the page to the app
 * with `?ws=` pointing at the server, and wait for "Connected".
 */
export async function setupApp(server: TestWsServer, page: Page, options: SetupOptions = {}): Promise<void> {
	// Clear any handlers left over from a previous test (server is worker-scoped)
	server.clearHandlers();

	// Default handlers for the four RPCs called during onConnected
	server.setStaticHandler("get_state", {
		command: "get_state",
		success: true,
		data: {
			sessionId: options.sessionId ?? "test-session",
			thinkingLevel: options.thinkingLevel ?? "medium",
		},
	});

	server.setStaticHandler("list_sessions", {
		command: "list_sessions",
		success: true,
		data: { sessions: options.sessions ?? [] },
	});

	server.setStaticHandler("get_messages", {
		command: "get_messages",
		success: true,
		data: { messages: options.messages ?? [] },
	});

	server.setStaticHandler("get_context_usage", {
		command: "get_context_usage",
		success: true,
		data: {
			usage:
				options.contextUsage === null
					? null
					: (options.contextUsage ?? { tokens: 1000, contextWindow: 200000, percent: 0.5 }),
		},
	});

	if (options.handlers) {
		for (const [type, response] of Object.entries(options.handlers)) {
			server.setStaticHandler(type as ClientCommand["type"], response);
		}
	}

	await page.goto(`/?ws=${encodeURIComponent(server.url)}`);

	// Wait for the WebSocket to connect and React to render the connected state
	await page.getByText("Connected").waitFor({ state: "visible" });
}

// ---------------------------------------------------------------------------
// Event builder helpers (reduce boilerplate in tests)
// ---------------------------------------------------------------------------

const MSG_STUB: AssistantMessage = { role: "assistant", content: [], timestamp: 0 };

export function agentStart(): AgentStartEvent {
	return { type: "agent_start" };
}

export function agentEnd(): AgentEndEvent {
	return { type: "agent_end" };
}

export function textDelta(delta: string): MessageUpdateEvent {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "text_delta", delta },
	};
}

export function textEnd(content: string): MessageUpdateEvent {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "text_end", content },
	};
}

export function thinkingDelta(delta: string): MessageUpdateEvent {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "thinking_delta", delta },
	};
}

export function thinkingEnd(content: string): MessageUpdateEvent {
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "thinking_end", content },
	};
}

export function toolCallEnd(id: string, name: string, args: Record<string, unknown>): MessageUpdateEvent {
	const toolCall: ToolCallContent = { type: "toolCall", id, name, arguments: args };
	return {
		type: "message_update",
		message: MSG_STUB,
		assistantMessageEvent: { type: "toolcall_end", toolCall },
	};
}

export function toolExecutionStart(toolName: string): ToolExecutionStartEvent {
	return { type: "tool_execution_start", toolName };
}

export function toolExecutionEnd(toolName: string, resultText: string, isError = false): ToolExecutionEndEvent {
	return {
		type: "tool_execution_end",
		toolName,
		result: { content: [{ type: "text", text: resultText }] },
		isError,
	};
}

export function messageEnd(content: MessageEndEvent["message"]["content"]): MessageEndEvent {
	return {
		type: "message_end",
		message: { role: "assistant", content, timestamp: Date.now() },
	};
}

export function extensionError(error: string): ExtensionErrorEvent {
	return { type: "extension_error", error };
}

export function sessionChanged(
	sessionId: string,
	reason: SessionChangedEvent["reason"],
	sessionName?: string,
): SessionChangedEvent {
	return { type: "session_changed", reason, sessionId, sessionName };
}

/** Shorthand for a successful RPC response body. */
export function successResponse(command: string, data?: unknown): RpcResponseBody {
	return {
		command,
		success: true,
		...(data !== undefined ? { data } : {}),
	};
}

/** Shorthand for a bash handler response body. */
export function bashResponse(result: BashResult): RpcResponseBody {
	return {
		command: "bash",
		success: true,
		data: result,
	};
}

/** Shorthand for a message_start event (used for steering interweave). */
export function messageStart(content: string): ServerEvent {
	return {
		type: "message_start",
		message: { role: "user", content, timestamp: Date.now() },
	};
}
