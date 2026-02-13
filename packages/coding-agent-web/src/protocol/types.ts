export interface TextContent {
	type: "text";
	text: string;
}

export interface ThinkingContent {
	type: "thinking";
	thinking: string;
}

export interface ToolCallContent {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export type AssistantContent = TextContent | ThinkingContent | ToolCallContent;

export interface UserMessage {
	role: "user";
	content: string | TextContent[];
	timestamp: number;
}

export interface AssistantMessage {
	role: "assistant";
	content: AssistantContent[];
	timestamp: number;
}

export interface ToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: TextContent[];
	isError: boolean;
	timestamp: number;
}

/** Union of message types returned by `get_messages`. */
export type HistoryMessage = UserMessage | AssistantMessage | ToolResultMessage;

export interface AssistantMessageEventTextDelta {
	type: "text_delta";
	delta: string;
}

export interface AssistantMessageEventTextEnd {
	type: "text_end";
	content: string;
}

export interface AssistantMessageEventThinkingDelta {
	type: "thinking_delta";
	delta: string;
}

export interface AssistantMessageEventThinkingEnd {
	type: "thinking_end";
	content: string;
}

export interface AssistantMessageEventToolCallEnd {
	type: "toolcall_end";
	toolCall: ToolCallContent;
}

export type AssistantMessageEvent =
	| AssistantMessageEventTextDelta
	| AssistantMessageEventTextEnd
	| AssistantMessageEventThinkingDelta
	| AssistantMessageEventThinkingEnd
	| AssistantMessageEventToolCallEnd
	| { type: "start" }
	| { type: "text_start" }
	| { type: "thinking_start" }
	| { type: "toolcall_start" }
	| { type: "toolcall_delta"; delta: string }
	| { type: "done" }
	| { type: "error" };

export interface RpcResponse {
	id?: string;
	type: "response";
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

export interface AgentStartEvent {
	type: "agent_start";
}

export interface AgentEndEvent {
	type: "agent_end";
}

export interface MessageUpdateEvent {
	type: "message_update";
	message: AssistantMessage;
	assistantMessageEvent: AssistantMessageEvent;
}

export interface MessageEndEvent {
	type: "message_end";
	message: AssistantMessage | ToolResultMessage;
}

export interface ToolExecutionStartEvent {
	type: "tool_execution_start";
	toolName: string;
}

export interface ToolExecutionEndEvent {
	type: "tool_execution_end";
	toolName: string;
	result: unknown;
	isError: boolean;
}

export interface SessionChangedEvent {
	type: "session_changed";
	reason: "new" | "switch" | "fork" | "tree" | "reload";
	sessionId: string;
	sessionFile?: string;
	sessionName?: string;
}

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export interface SessionSummary {
	path: string;
	id: string;
	cwd: string;
	name?: string;
	created: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
}

export interface ExtensionUiRequestEvent {
	type: "extension_ui_request";
	id: string;
	method:
		| "select"
		| "confirm"
		| "input"
		| "editor"
		| "notify"
		| "setStatus"
		| "setWidget"
		| "setTitle"
		| "set_editor_text";
	message?: string;
	text?: string;
	title?: string;
}

export interface ExtensionErrorEvent {
	type: "extension_error";
	error: string;
}

export type ServerEvent =
	| RpcResponse
	| AgentStartEvent
	| AgentEndEvent
	| MessageUpdateEvent
	| MessageEndEvent
	| ToolExecutionStartEvent
	| ToolExecutionEndEvent
	| SessionChangedEvent
	| ExtensionUiRequestEvent
	| ExtensionErrorEvent;

export interface PromptCommand {
	id?: string;
	type: "prompt";
	message: string;
}

export interface AbortCommand {
	id?: string;
	type: "abort";
}

export interface ListSessionsCommand {
	id?: string;
	type: "list_sessions";
	scope?: "cwd" | "all";
}

export interface SwitchSessionCommand {
	id?: string;
	type: "switch_session";
	sessionPath: string;
}

export interface NewSessionCommand {
	id?: string;
	type: "new_session";
}

export interface GetStateCommand {
	id?: string;
	type: "get_state";
}

export interface GetMessagesCommand {
	id?: string;
	type: "get_messages";
}

export type ClientCommand =
	| PromptCommand
	| AbortCommand
	| ListSessionsCommand
	| SwitchSessionCommand
	| NewSessionCommand
	| GetStateCommand
	| GetMessagesCommand;

export type ExtensionUiResponse =
	| { type: "extension_ui_response"; id: string; cancelled: true }
	| { type: "extension_ui_response"; id: string; confirmed: boolean }
	| { type: "extension_ui_response"; id: string; value: string };
