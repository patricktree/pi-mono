import type {
	AssistantContent,
	ContextUsage,
	ExtensionErrorEvent,
	ExtensionUiRequestEvent,
	HistoryMessage,
	ImageContent,
	MessageStartEvent,
	MessageUpdateEvent,
	RpcResponse,
	ServerEvent,
	SessionSummary,
	ThinkingLevel,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
} from "../protocol/types.js";

export type UiMessageKind = "user" | "assistant" | "thinking" | "tool" | "error" | "system" | "bash";

export type ToolStepPhase = "calling" | "running" | "done" | "error";

export interface ToolStepData {
	toolName: string;
	toolArgs: string;
	phase: ToolStepPhase;
	/** Result preview text, set when phase is "done" or "error". */
	result?: string;
}

export interface BashResultData {
	command: string;
	output: string;
	exitCode: number | undefined;
}

export interface UiMessage {
	id: string;
	kind: UiMessageKind;
	text: string;
	/** Present only when kind === "tool". */
	toolStep?: ToolStepData;
	/** Present only when kind === "bash". */
	bashResult?: BashResultData;
	/** Attached images, present on user messages with image attachments. */
	images?: ImageContent[];
}

export interface AppState {
	connected: boolean;
	streaming: boolean;
	messages: UiMessage[];
	/** Steering messages queued but not yet interweaved into the conversation. */
	scheduledMessages: UiMessage[];
	/** Available sessions, sorted by modified date (newest first). */
	sessions: SessionSummary[];
	/** Current session ID. */
	currentSessionId: string | null;
	/** Whether the sidebar is open. */
	sidebarOpen: boolean;
	/** Context window usage, undefined until first fetch. */
	contextUsage: ContextUsage | undefined;
	/** Current thinking level, undefined until first state fetch. */
	thinkingLevel: ThinkingLevel | undefined;
}

let nextMessageId = 0;

function createMessage(kind: UiMessageKind, text: string): UiMessage {
	nextMessageId += 1;
	return {
		id: `msg_${nextMessageId}`,
		kind,
		text,
	};
}

function createToolStepMessage(toolName: string, toolArgs: string): UiMessage {
	nextMessageId += 1;
	return {
		id: `msg_${nextMessageId}`,
		kind: "tool",
		text: `${toolName}(${toolArgs})`,
		toolStep: {
			toolName,
			toolArgs,
			phase: "calling",
		},
	};
}

export class AppStore {
	private state: AppState = {
		connected: false,
		streaming: false,
		messages: [],
		scheduledMessages: [],
		sessions: [],
		currentSessionId: null,
		sidebarOpen: false,
		contextUsage: undefined,
		thinkingLevel: undefined,
	};

	private listeners = new Set<(state: AppState) => void>();
	private activeTextMessageId: string | null = null;
	private activeThinkingMessageId: string | null = null;
	/** ID of the most recent tool step message (for in-place updates). */
	private activeToolStepId: string | null = null;

	subscribe(listener: (state: AppState) => void): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => {
			this.listeners.delete(listener);
		};
	}

	getState(): AppState {
		return this.state;
	}

	setConnected(connected: boolean): void {
		this.state = {
			...this.state,
			connected,
		};
		this.emit();
	}

	addUserMessage(text: string, options?: { images?: ImageContent[]; scheduled?: boolean }): void {
		const msg = createMessage("user", text);
		if (options?.images && options.images.length > 0) {
			msg.images = options.images;
		}
		if (options?.scheduled) {
			this.state = {
				...this.state,
				scheduledMessages: [...this.state.scheduledMessages, msg],
			};
		} else {
			this.state = {
				...this.state,
				messages: [...this.state.messages, msg],
			};
		}
		this.emit();
	}

	/** Clear all scheduled messages and return them. */
	clearScheduledMessages(): UiMessage[] {
		const cleared = this.state.scheduledMessages;
		this.state = {
			...this.state,
			scheduledMessages: [],
		};
		this.emit();
		return cleared;
	}

	addErrorMessage(text: string): void {
		this.pushMessage("error", text);
	}

	addSystemMessage(text: string): void {
		this.pushMessage("system", text);
	}

	addBashResultMessage(command: string, output: string, exitCode: number | undefined): void {
		nextMessageId += 1;
		const msg: UiMessage = {
			id: `msg_${nextMessageId}`,
			kind: "bash",
			text: `$ ${command}\n${output}`,
			bashResult: { command, output, exitCode },
		};
		this.state = {
			...this.state,
			messages: [...this.state.messages, msg],
		};
		this.emit();
	}

	// ------------------------------------------------------------------
	// Session state
	// ------------------------------------------------------------------

	setSessions(sessions: SessionSummary[]): void {
		const sorted = [...sessions].sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
		this.state = { ...this.state, sessions: sorted };
		this.emit();
	}

	setCurrentSessionId(sessionId: string | null): void {
		this.state = { ...this.state, currentSessionId: sessionId };
		this.emit();
	}

	/** Update session ID and sessions list atomically to avoid intermediate renders
	 * where the new session ID cannot be found in the stale sessions list. */
	setSessionState(sessionId: string | null, sessions: SessionSummary[]): void {
		const sorted = [...sessions].sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
		this.state = { ...this.state, currentSessionId: sessionId, sessions: sorted };
		this.emit();
	}

	setSidebarOpen(open: boolean): void {
		this.state = { ...this.state, sidebarOpen: open };
		this.emit();
	}

	setContextUsage(usage: ContextUsage | undefined): void {
		this.state = { ...this.state, contextUsage: usage };
		this.emit();
	}

	setThinkingLevel(level: ThinkingLevel | undefined): void {
		this.state = { ...this.state, thinkingLevel: level };
		this.emit();
	}

	/** Clear messages (e.g. when switching sessions). */
	clearMessages(): void {
		this.state = { ...this.state, messages: [], scheduledMessages: [] };
		this.activeTextMessageId = null;
		this.activeThinkingMessageId = null;
		this.activeToolStepId = null;
		this.emit();
	}

	/** Convert server-side message history into UiMessages and replace current messages. */
	loadMessagesFromHistory(history: HistoryMessage[]): void {
		const uiMessages: UiMessage[] = [];
		/** Map from toolCallId → tool step message, so toolResult can attach result. */
		const toolStepMap = new Map<string, UiMessage>();

		for (const msg of history) {
			switch (msg.role) {
				case "user": {
					const text = typeof msg.content === "string" ? msg.content : msg.content.map((c) => c.text).join("");
					uiMessages.push(createMessage("user", text));
					break;
				}
				case "assistant": {
					for (const part of msg.content) {
						uiMessages.push(...convertAssistantPart(part, toolStepMap));
					}
					break;
				}
				case "toolResult": {
					const resultText = msg.content.map((c) => c.text).join("");
					const phase = msg.isError ? "error" : "done";

					// Try to update the matching tool step in-place
					const toolStep = toolStepMap.get(msg.toolCallId);
					if (toolStep?.toolStep) {
						toolStep.toolStep.phase = phase;
						toolStep.toolStep.result = resultText;
					}
					break;
				}
			}
		}

		this.state = { ...this.state, messages: uiMessages };
		this.activeTextMessageId = null;
		this.activeThinkingMessageId = null;
		this.activeToolStepId = null;
		this.emit();
	}

	// ------------------------------------------------------------------
	// Server events
	// ------------------------------------------------------------------

	handleServerEvent(event: ServerEvent): void {
		switch (event.type) {
			case "agent_start": {
				this.state = {
					...this.state,
					streaming: true,
				};
				this.activeTextMessageId = null;
				this.activeThinkingMessageId = null;
				this.activeToolStepId = null;
				this.emit();
				return;
			}

			case "agent_end": {
				this.state = {
					...this.state,
					streaming: false,
				};
				this.activeTextMessageId = null;
				this.activeThinkingMessageId = null;
				this.activeToolStepId = null;
				this.emit();
				return;
			}

			case "message_start": {
				this.applyMessageStart(event);
				return;
			}

			case "message_update": {
				this.applyMessageUpdate(event);
				return;
			}

			case "message_end": {
				this.activeTextMessageId = null;
				this.activeThinkingMessageId = null;
				return;
			}

			case "tool_execution_start": {
				this.applyToolExecutionStart(event);
				return;
			}

			case "tool_execution_end": {
				this.applyToolExecutionEnd(event);
				return;
			}

			case "response": {
				this.applyResponse(event);
				return;
			}

			case "session_changed": {
				// The UI component will handle refreshing session data
				return;
			}

			case "extension_ui_request": {
				this.applyExtensionUiRequest(event);
				return;
			}

			case "extension_error": {
				this.applyExtensionError(event);
				return;
			}

			default:
				return;
		}
	}

	private applyMessageStart(event: MessageStartEvent): void {
		// When a user message is interweaved (steering), find the first scheduled
		// message with matching text, move it from scheduledMessages into messages.
		if (event.message.role === "user") {
			const content = event.message.content;
			const text = typeof content === "string" ? content : content.map((c) => ("text" in c ? c.text : "")).join("");

			const scheduledIndex = this.state.scheduledMessages.findIndex((m) => m.kind === "user" && m.text === text);
			if (scheduledIndex !== -1) {
				const scheduled = this.state.scheduledMessages[scheduledIndex];
				this.state = {
					...this.state,
					messages: [...this.state.messages, scheduled],
					scheduledMessages: this.state.scheduledMessages.filter((_, i) => i !== scheduledIndex),
				};
				this.emit();
			}
		}
	}

	private applyMessageUpdate(event: MessageUpdateEvent): void {
		const assistantEvent = event.assistantMessageEvent;
		switch (assistantEvent.type) {
			case "text_delta": {
				if (!this.activeTextMessageId) {
					const message = createMessage("assistant", "");
					this.state = {
						...this.state,
						messages: [...this.state.messages, message],
					};
					this.activeTextMessageId = message.id;
				}
				this.appendToMessage(this.activeTextMessageId, assistantEvent.delta);
				return;
			}

			case "text_end": {
				this.activeTextMessageId = null;
				return;
			}

			case "thinking_delta": {
				if (!this.activeThinkingMessageId) {
					const message = createMessage("thinking", "");
					this.state = {
						...this.state,
						messages: [...this.state.messages, message],
					};
					this.activeThinkingMessageId = message.id;
				}
				this.appendToMessage(this.activeThinkingMessageId, assistantEvent.delta);
				return;
			}

			case "thinking_end": {
				this.activeThinkingMessageId = null;
				return;
			}

			case "toolcall_end": {
				const args = JSON.stringify(assistantEvent.toolCall.arguments ?? {});
				const argsPreview = args.length > 200 ? `${args.slice(0, 200)}...` : args;
				const msg = createToolStepMessage(assistantEvent.toolCall.name, argsPreview);
				this.state = {
					...this.state,
					messages: [...this.state.messages, msg],
				};
				this.activeToolStepId = msg.id;
				this.activeTextMessageId = null;
				this.activeThinkingMessageId = null;
				this.emit();
				return;
			}

			default:
				return;
		}
	}

	private applyToolExecutionStart(_event: ToolExecutionStartEvent): void {
		this.activeTextMessageId = null;
		this.activeThinkingMessageId = null;

		if (this.activeToolStepId) {
			this.updateToolStepPhase(this.activeToolStepId, "running");
		}
	}

	private applyToolExecutionEnd(event: ToolExecutionEndEvent): void {
		if (this.activeToolStepId) {
			const fullText = extractResultText(event.result);
			this.updateToolStepPhase(this.activeToolStepId, event.isError ? "error" : "done", fullText);
			this.activeToolStepId = null;
		}
	}

	private updateToolStepPhase(messageId: string, phase: ToolStepPhase, result?: string): void {
		this.state = {
			...this.state,
			messages: this.state.messages.map((msg) =>
				msg.id === messageId && msg.toolStep
					? {
							...msg,
							toolStep: {
								...msg.toolStep,
								phase,
								result: result ?? msg.toolStep.result,
							},
						}
					: msg,
			),
		};
		this.emit();
	}

	private applyResponse(event: RpcResponse): void {
		if (!event.success) {
			this.pushMessage("error", `Command error (${event.command}): ${event.error || "unknown error"}`);
		}
	}

	private applyExtensionUiRequest(event: ExtensionUiRequestEvent): void {
		if (event.method === "notify" && event.message) {
			this.pushMessage("system", event.message);
		}
		if (event.method === "set_editor_text" && event.text) {
			this.pushMessage("system", "Extension updated editor text");
		}
	}

	private applyExtensionError(event: ExtensionErrorEvent): void {
		this.pushMessage("error", `Extension error: ${event.error}`);
	}

	private pushMessage(kind: UiMessageKind, text: string): void {
		this.state = {
			...this.state,
			messages: [...this.state.messages, createMessage(kind, text)],
		};
		this.emit();
	}

	private appendToMessage(messageId: string | null, delta: string): void {
		if (!messageId) {
			return;
		}
		this.state = {
			...this.state,
			messages: this.state.messages.map((message) =>
				message.id === messageId
					? {
							...message,
							text: `${message.text}${delta}`,
						}
					: message,
			),
		};
		this.emit();
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener(this.state);
		}
	}
}

function convertAssistantPart(part: AssistantContent, toolStepMap: Map<string, UiMessage>): UiMessage[] {
	switch (part.type) {
		case "text": {
			if (!part.text.trim()) return [];
			return [createMessage("assistant", part.text)];
		}
		case "thinking": {
			if (!part.thinking.trim()) return [];
			return [createMessage("thinking", part.thinking)];
		}
		case "toolCall": {
			const args = JSON.stringify(part.arguments ?? {});
			const argsPreview = args.length > 200 ? `${args.slice(0, 200)}...` : args;
			const msg = createToolStepMessage(part.name, argsPreview);
			toolStepMap.set(part.id, msg);
			return [msg];
		}
	}
}

/** Extract plain text from a tool result, which may be a string, a content array, or an arbitrary object. */
function extractResultText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	// Handle { content: [{ type: "text", text: "..." }, ...] } shape
	if (typeof value === "object" && value !== null && "content" in value) {
		const content = (value as { content: unknown }).content;
		if (Array.isArray(content)) {
			const texts: string[] = [];
			for (const part of content) {
				if (
					typeof part === "object" &&
					part !== null &&
					"text" in part &&
					typeof (part as { text: unknown }).text === "string"
				) {
					texts.push((part as { text: string }).text);
				}
			}
			if (texts.length > 0) {
				return texts.join("");
			}
		}
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
