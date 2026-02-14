import type {
	AssistantContent,
	ContextUsage,
	ExtensionErrorEvent,
	ExtensionUiRequestEvent,
	HistoryMessage,
	ImageContent,
	MessageUpdateEvent,
	RpcResponse,
	ServerEvent,
	SessionSummary,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
} from "../protocol/types.js";

export type UiMessageKind = "user" | "assistant" | "thinking" | "tool" | "error" | "system";

export type ToolStepPhase = "calling" | "running" | "done" | "error";

export interface ToolStepData {
	toolName: string;
	toolArgs: string;
	phase: ToolStepPhase;
	/** Result preview text, set when phase is "done" or "error". */
	result?: string;
}

export interface UiMessage {
	id: string;
	kind: UiMessageKind;
	text: string;
	/** Present only when kind === "tool". */
	toolStep?: ToolStepData;
	/** Attached images, present on user messages with image attachments. */
	images?: ImageContent[];
}

export interface AppState {
	connected: boolean;
	streaming: boolean;
	messages: UiMessage[];
	/** Available sessions, sorted by modified date (newest first). */
	sessions: SessionSummary[];
	/** Current session ID. */
	currentSessionId: string | null;
	/** Whether the sidebar is open. */
	sidebarOpen: boolean;
	/** Context window usage, undefined until first fetch. */
	contextUsage: ContextUsage | undefined;
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
		sessions: [],
		currentSessionId: null,
		sidebarOpen: false,
		contextUsage: undefined,
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

	addUserMessage(text: string, images?: ImageContent[]): void {
		const msg = createMessage("user", text);
		if (images && images.length > 0) {
			msg.images = images;
		}
		this.state = {
			...this.state,
			messages: [...this.state.messages, msg],
		};
		this.emit();
	}

	addErrorMessage(text: string): void {
		this.pushMessage("error", text);
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

	setSidebarOpen(open: boolean): void {
		this.state = { ...this.state, sidebarOpen: open };
		this.emit();
	}

	setContextUsage(usage: ContextUsage | undefined): void {
		this.state = { ...this.state, contextUsage: usage };
		this.emit();
	}

	/** Clear messages (e.g. when switching sessions). */
	clearMessages(): void {
		this.state = { ...this.state, messages: [] };
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
					const preview = resultText.length > 300 ? `${resultText.slice(0, 300)}...` : resultText;
					const phase = msg.isError ? "error" : "done";

					// Try to update the matching tool step in-place
					const toolStep = toolStepMap.get(msg.toolCallId);
					if (toolStep?.toolStep) {
						toolStep.toolStep.phase = phase;
						toolStep.toolStep.result = preview;
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
			const preview = toPreviewString(event.result, 300);
			this.updateToolStepPhase(this.activeToolStepId, event.isError ? "error" : "done", preview);
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

function toPreviewString(value: unknown, maxLength: number): string {
	if (typeof value === "string") {
		return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
	}
	try {
		const stringified = JSON.stringify(value);
		return stringified.length > maxLength ? `${stringified.slice(0, maxLength)}...` : stringified;
	} catch {
		return String(value);
	}
}
