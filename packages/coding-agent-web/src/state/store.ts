import type {
	ExtensionErrorEvent,
	ExtensionUiRequestEvent,
	MessageUpdateEvent,
	RpcResponse,
	ServerEvent,
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
}

export interface AppState {
	connected: boolean;
	streaming: boolean;
	messages: UiMessage[];
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

	addUserMessage(text: string): void {
		this.pushMessage("user", text);
	}

	addErrorMessage(text: string): void {
		this.pushMessage("error", text);
	}

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
				this.pushMessage("system", `Session changed (${event.reason})`);
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
