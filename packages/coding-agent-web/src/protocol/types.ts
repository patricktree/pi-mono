export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ImageContent {
	type: "image";
	data: string; // base64 encoded image data
	mimeType: string; // e.g., "image/jpeg", "image/png"
}

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

// ---------------------------------------------------------------------------
// RPC response data map — maps each command type to its success response data.
// Commands that carry no data map to `undefined`.
// ---------------------------------------------------------------------------

export interface DirectoryEntry {
	name: string;
	isDirectory: boolean;
}

export interface RpcResponseDataMap {
	prompt: undefined;
	abort: undefined;
	clear_queue: undefined;
	list_sessions: { sessions: SessionSummary[] };
	switch_session: { cancelled: boolean };
	new_session: { cancelled: boolean };
	get_messages: { messages: HistoryMessage[] };
	get_state: { sessionId: string; sessionName?: string; thinkingLevel?: ThinkingLevel };
	set_thinking_level: undefined;
	get_context_usage: { usage?: ContextUsage };
	bash: BashResult;
	abort_bash: undefined;
	list_directory: { absolutePath: string; entries: DirectoryEntry[] };
}

/** Per-command success variants: includes `data` only for commands that carry data. */
type RpcSuccessResponses = {
	[C in ClientCommand["type"]]: RpcResponseDataMap[C] extends undefined
		? { id?: string; type: "response"; command: C; success: true }
		: { id?: string; type: "response"; command: C; success: true; data: RpcResponseDataMap[C] };
};

export type RpcResponse =
	| RpcSuccessResponses[ClientCommand["type"]]
	| { id?: string; type: "response"; command: string; success: false; error: string };

/** Narrow `RpcResponse` to the variants for a specific command type. */
export type RpcResponseFor<C extends ClientCommand["type"]> =
	| Extract<RpcResponse, { command: C; success: true }>
	| Extract<RpcResponse, { success: false }>;

export interface AgentStartEvent {
	type: "agent_start";
}

export interface AgentEndEvent {
	type: "agent_end";
}

export interface MessageStartEvent {
	type: "message_start";
	message: UserMessage | AssistantMessage | ToolResultMessage;
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
// Context usage
// ---------------------------------------------------------------------------

export interface ContextUsage {
	tokens: number;
	contextWindow: number;
	percent: number;
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
	| MessageStartEvent
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
	images?: ImageContent[];
	streamingBehavior?: "steer" | "followUp";
}

export interface AbortCommand {
	id?: string;
	type: "abort";
}

export interface ClearQueueCommand {
	id?: string;
	type: "clear_queue";
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
	cwd?: string;
}

export interface GetStateCommand {
	id?: string;
	type: "get_state";
}

export interface GetMessagesCommand {
	id?: string;
	type: "get_messages";
}

export interface GetContextUsageCommand {
	id?: string;
	type: "get_context_usage";
}

export interface BashCommand {
	id?: string;
	type: "bash";
	command: string;
}

export interface SetThinkingLevelCommand {
	id?: string;
	type: "set_thinking_level";
	level: ThinkingLevel;
}

export interface AbortBashCommand {
	id?: string;
	type: "abort_bash";
}

export interface ListDirectoryCommand {
	id?: string;
	type: "list_directory";
	path: string;
}

export interface BashResult {
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
}

export type ClientCommand =
	| PromptCommand
	| AbortCommand
	| ClearQueueCommand
	| ListSessionsCommand
	| SwitchSessionCommand
	| NewSessionCommand
	| GetStateCommand
	| GetMessagesCommand
	| GetContextUsageCommand
	| SetThinkingLevelCommand
	| BashCommand
	| AbortBashCommand
	| ListDirectoryCommand;

export type ExtensionUiResponse =
	| { type: "extension_ui_response"; id: string; cancelled: true }
	| { type: "extension_ui_response"; id: string; confirmed: boolean }
	| { type: "extension_ui_response"; id: string; value: string };
