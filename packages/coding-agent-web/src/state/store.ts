import { create } from "zustand";
import type {
	A2uiSurfaceCompleteEvent,
	A2uiSurfaceUpdateEvent,
	AssistantContent,
	ExtensionErrorEvent,
	ExtensionUiRequestEvent,
	HistoryMessage,
	ImageContent,
	MessageUpdateEvent,
	RpcResponse,
	ServerEvent,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
} from "../protocol/types.js";

export type UiMessageKind = "user" | "assistant" | "thinking" | "tool" | "error" | "system" | "bash" | "a2ui";

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

export interface A2uiSurfaceData {
	surfaceId: string;
	/** Accumulated A2UI v0.9 messages (grows with streaming). */
	messages: unknown[];
	/** Whether the surface is still interactive (false after turn ends). */
	interactive: boolean;
	/** Revision counter to trigger React re-renders on message appends. */
	revision: number;
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
	/** Present only when kind === "a2ui". */
	a2uiSurface?: A2uiSurfaceData;
}

export type AppInputMode = "prompt" | "shell";

type Updater<T> = T | ((previous: T) => T);

export class MessageController {
	private nextMessageId = 0;
	private activeTextMessageId: string | null = null;
	private activeThinkingMessageId: string | null = null;
	/** ID of the most recent tool step message (for in-place updates). */
	private activeToolStepId: string | null = null;

	createUserMessage(text: string, options?: { images?: ImageContent[] }): UiMessage {
		const message = this.createMessage("user", text);
		if (options?.images && options.images.length > 0) {
			message.images = options.images;
		}
		return message;
	}

	createErrorMessage(text: string): UiMessage {
		return this.createMessage("error", text);
	}

	createBashResultMessage(command: string, output: string, exitCode: number | undefined): UiMessage {
		this.nextMessageId += 1;
		return {
			id: `msg_${this.nextMessageId}`,
			kind: "bash",
			text: `$ ${command}\n${output}`,
			bashResult: { command, output, exitCode },
		};
	}

	resetActiveMessageIds(): void {
		this.activeTextMessageId = null;
		this.activeThinkingMessageId = null;
		this.activeToolStepId = null;
	}

	loadMessagesFromHistory(history: HistoryMessage[]): UiMessage[] {
		const uiMessages: UiMessage[] = [];
		/** Map from toolCallId → tool step message, so toolResult can attach result. */
		const toolStepMap = new Map<string, UiMessage>();

		for (const message of history) {
			switch (message.role) {
				case "user": {
					const text =
						typeof message.content === "string"
							? message.content
							: message.content.map((part) => part.text).join("");
					uiMessages.push(this.createMessage("user", text));
					break;
				}
				case "assistant": {
					for (const part of message.content) {
						uiMessages.push(...this.convertAssistantPart(part, toolStepMap));
					}
					break;
				}
				case "toolResult": {
					const resultText = message.content.map((part) => part.text).join("");
					const phase = message.isError ? "error" : "done";

					const toolStep = toolStepMap.get(message.toolCallId);
					if (toolStep?.toolStep) {
						toolStep.toolStep.phase = phase;
						toolStep.toolStep.result = resultText;
					}
					break;
				}
			}
		}

		// Deduplicate A2UI surfaces: if the same surface_id was rendered multiple
		// times, only keep the last occurrence (matches live streaming behavior).
		const seenSurfaceIds = new Set<string>();
		for (let i = uiMessages.length - 1; i >= 0; i--) {
			const msg = uiMessages[i];
			if (msg.kind === "a2ui" && msg.a2uiSurface) {
				if (seenSurfaceIds.has(msg.a2uiSurface.surfaceId)) {
					uiMessages.splice(i, 1);
				} else {
					seenSurfaceIds.add(msg.a2uiSurface.surfaceId);
				}
			}
		}

		this.resetActiveMessageIds();
		return uiMessages;
	}

	handleServerEvent(messages: UiMessage[], event: ServerEvent): UiMessage[] {
		switch (event.type) {
			case "agent_start": {
				this.resetActiveMessageIds();
				return messages;
			}

			case "agent_end": {
				this.resetActiveMessageIds();
				return messages;
			}

			case "message_start": {
				return messages;
			}

			case "message_update": {
				return this.applyMessageUpdate(messages, event);
			}

			case "message_end": {
				this.activeTextMessageId = null;
				this.activeThinkingMessageId = null;
				return messages;
			}

			case "tool_execution_start": {
				return this.applyToolExecutionStart(messages, event);
			}

			case "tool_execution_end": {
				return this.applyToolExecutionEnd(messages, event);
			}

			case "response": {
				return this.applyResponse(messages, event);
			}

			case "session_changed": {
				return messages;
			}

			case "extension_ui_request": {
				return this.applyExtensionUiRequest(messages, event);
			}

			case "extension_error": {
				return this.applyExtensionError(messages, event);
			}

			case "a2ui_surface_update": {
				return this.applyA2uiSurfaceUpdate(messages, event);
			}

			case "a2ui_surface_complete": {
				return this.applyA2uiSurfaceComplete(messages, event);
			}

			default:
				return messages;
		}
	}

	private createMessage(kind: UiMessageKind, text: string): UiMessage {
		this.nextMessageId += 1;
		return {
			id: `msg_${this.nextMessageId}`,
			kind,
			text,
		};
	}

	private createToolStepMessage(toolName: string, toolArgs: string): UiMessage {
		this.nextMessageId += 1;
		return {
			id: `msg_${this.nextMessageId}`,
			kind: "tool",
			text: `${toolName}(${toolArgs})`,
			toolStep: {
				toolName,
				toolArgs,
				phase: "calling",
			},
		};
	}

	private pushMessage(messages: UiMessage[], kind: UiMessageKind, text: string): UiMessage[] {
		return [...messages, this.createMessage(kind, text)];
	}

	private appendToMessage(messages: UiMessage[], messageId: string | null, delta: string): UiMessage[] {
		if (!messageId) {
			return messages;
		}
		return messages.map((message) =>
			message.id === messageId
				? {
						...message,
						text: `${message.text}${delta}`,
					}
				: message,
		);
	}

	private updateToolStepPhase(
		messages: UiMessage[],
		messageId: string,
		phase: ToolStepPhase,
		result?: string,
	): UiMessage[] {
		return messages.map((message) =>
			message.id === messageId && message.toolStep
				? {
						...message,
						toolStep: {
							...message.toolStep,
							phase,
							result: result ?? message.toolStep.result,
						},
					}
				: message,
		);
	}

	private applyMessageUpdate(messages: UiMessage[], event: MessageUpdateEvent): UiMessage[] {
		const assistantEvent = event.assistantMessageEvent;
		switch (assistantEvent.type) {
			case "text_delta": {
				let nextMessages = messages;
				if (!this.activeTextMessageId) {
					const message = this.createMessage("assistant", "");
					nextMessages = [...nextMessages, message];
					this.activeTextMessageId = message.id;
				}
				return this.appendToMessage(nextMessages, this.activeTextMessageId, assistantEvent.delta);
			}

			case "text_end": {
				this.activeTextMessageId = null;
				return messages;
			}

			case "thinking_delta": {
				let nextMessages = messages;
				if (!this.activeThinkingMessageId) {
					const message = this.createMessage("thinking", "");
					nextMessages = [...nextMessages, message];
					this.activeThinkingMessageId = message.id;
				}
				return this.appendToMessage(nextMessages, this.activeThinkingMessageId, assistantEvent.delta);
			}

			case "thinking_end": {
				this.activeThinkingMessageId = null;
				return messages;
			}

			case "toolcall_end": {
				const args = JSON.stringify(assistantEvent.toolCall.arguments ?? {});
				const argsPreview = args.length > 200 ? `${args.slice(0, 200)}...` : args;
				const message = this.createToolStepMessage(assistantEvent.toolCall.name, argsPreview);
				this.activeToolStepId = message.id;
				this.activeTextMessageId = null;
				this.activeThinkingMessageId = null;
				return [...messages, message];
			}

			default:
				return messages;
		}
	}

	private applyToolExecutionStart(messages: UiMessage[], _event: ToolExecutionStartEvent): UiMessage[] {
		this.activeTextMessageId = null;
		this.activeThinkingMessageId = null;

		if (!this.activeToolStepId) {
			return messages;
		}
		return this.updateToolStepPhase(messages, this.activeToolStepId, "running");
	}

	private applyToolExecutionEnd(messages: UiMessage[], event: ToolExecutionEndEvent): UiMessage[] {
		if (!this.activeToolStepId) {
			return messages;
		}
		const fullText = extractResultText(event.result);
		const nextMessages = this.updateToolStepPhase(
			messages,
			this.activeToolStepId,
			event.isError ? "error" : "done",
			fullText,
		);
		this.activeToolStepId = null;
		return nextMessages;
	}

	private applyResponse(messages: UiMessage[], event: RpcResponse): UiMessage[] {
		if (!event.success) {
			return this.pushMessage(
				messages,
				"error",
				`Command error (${event.command}): ${event.error || "unknown error"}`,
			);
		}
		return messages;
	}

	private applyExtensionUiRequest(messages: UiMessage[], event: ExtensionUiRequestEvent): UiMessage[] {
		let nextMessages = messages;
		if (event.method === "notify" && event.message) {
			nextMessages = this.pushMessage(nextMessages, "system", event.message);
		}
		if (event.method === "set_editor_text" && event.text) {
			nextMessages = this.pushMessage(nextMessages, "system", "Extension updated editor text");
		}
		return nextMessages;
	}

	private applyExtensionError(messages: UiMessage[], event: ExtensionErrorEvent): UiMessage[] {
		return this.pushMessage(messages, "error", `Extension error: ${event.error}`);
	}

	private applyA2uiSurfaceUpdate(messages: UiMessage[], event: A2uiSurfaceUpdateEvent): UiMessage[] {
		// Remove any existing surface with the same ID so it re-appears at the
		// current position with fresh messages (each render_ui call provides a
		// complete surface definition).
		const filtered = messages.filter((m) => !(m.kind === "a2ui" && m.a2uiSurface?.surfaceId === event.surfaceId));

		this.nextMessageId += 1;
		const message: UiMessage = {
			id: `msg_${this.nextMessageId}`,
			kind: "a2ui",
			text: `[A2UI surface: ${event.surfaceId}]`,
			a2uiSurface: {
				surfaceId: event.surfaceId,
				messages: [...event.messages],
				interactive: true,
				revision: 0,
			},
		};
		return [...filtered, message];
	}

	private applyA2uiSurfaceComplete(messages: UiMessage[], event: A2uiSurfaceCompleteEvent): UiMessage[] {
		return messages.map((m) =>
			m.kind === "a2ui" && m.a2uiSurface?.surfaceId === event.surfaceId
				? {
						...m,
						a2uiSurface: {
							...m.a2uiSurface,
							interactive: false,
						},
					}
				: m,
		);
	}

	private convertAssistantPart(part: AssistantContent, toolStepMap: Map<string, UiMessage>): UiMessage[] {
		switch (part.type) {
			case "text": {
				if (!part.text.trim()) return [];
				return [this.createMessage("assistant", part.text)];
			}
			case "thinking": {
				if (!part.thinking.trim()) return [];
				return [this.createMessage("thinking", part.thinking)];
			}
			case "toolCall": {
				const args = JSON.stringify(part.arguments ?? {});
				const argsPreview = args.length > 200 ? `${args.slice(0, 200)}...` : args;
				const message = this.createToolStepMessage(part.name, argsPreview);
				toolStepMap.set(part.id, message);

				const result: UiMessage[] = [message];

				// Reconstruct A2UI surfaces from render_ui tool calls so they
				// survive page refresh (the live a2ui_surface_update events are
				// not persisted in message history).
				if (part.name === "render_ui" && part.arguments) {
					const surfaceId = part.arguments.surface_id as string | undefined;
					const a2uiMessages = part.arguments.messages as unknown[] | undefined;
					if (surfaceId && Array.isArray(a2uiMessages)) {
						this.nextMessageId += 1;
						result.push({
							id: `msg_${this.nextMessageId}`,
							kind: "a2ui",
							text: `[A2UI surface: ${surfaceId}]`,
							a2uiSurface: {
								surfaceId,
								messages: a2uiMessages,
								interactive: false,
								revision: 0,
							},
						});
					}
				}

				return result;
			}
		}
	}
}

export interface AppState {
	connected: boolean;
	streaming: boolean;
	/** Steering messages queued but not yet interweaved into the conversation. */
	scheduledMessages: UiMessage[];
	/** Whether the sidebar is open. */
	sidebarOpen: boolean;
	/** Current prompt input text. */
	prompt: string;
	/** Prompt input mode. */
	inputMode: AppInputMode;
	/** Pending image attachments for the next user prompt. */
	pendingImages: ImageContent[];
	/** Expanded tool rows in the message list. */
	expandedTools: Set<string>;
}

interface AppActions {
	setConnected: (connected: boolean) => void;
	setStreaming: (streaming: boolean) => void;
	setSidebarOpen: (open: boolean) => void;
	setPrompt: (updater: Updater<string>) => void;
	setInputMode: (mode: AppInputMode) => void;
	addPendingImages: (images: ImageContent[]) => void;
	removePendingImage: (index: number) => void;
	clearPendingImages: () => void;
	clearExpandedTools: () => void;
	setExpandedTools: (updater: Updater<Set<string>>) => void;
	addScheduledMessage: (message: UiMessage) => void;
	clearScheduledMessages: () => UiMessage[];
	consumeScheduledMessage: (text: string) => UiMessage | undefined;
}

export type AppStore = AppState & AppActions;

const INITIAL_STATE: AppState = {
	connected: false,
	streaming: false,
	scheduledMessages: [],
	sidebarOpen: false,
	prompt: "",
	inputMode: "prompt",
	pendingImages: [],
	expandedTools: new Set<string>(),
};

function resolveUpdater<T>(updater: Updater<T>, previous: T): T {
	if (typeof updater === "function") {
		const updaterFunction = updater as (value: T) => T;
		return updaterFunction(previous);
	}
	return updater;
}

export const useAppStore = create<AppStore>((set, get) => ({
	...INITIAL_STATE,

	setConnected: (connected) => {
		set({ connected });
	},

	setStreaming: (streaming) => {
		set({ streaming });
	},

	setSidebarOpen: (open) => {
		set({ sidebarOpen: open });
	},

	setPrompt: (updater) => {
		set((state) => ({
			prompt: resolveUpdater(updater, state.prompt),
		}));
	},

	setInputMode: (mode) => {
		set({ inputMode: mode });
	},

	addPendingImages: (images) => {
		if (images.length === 0) {
			return;
		}
		set((state) => ({
			pendingImages: [...state.pendingImages, ...images],
		}));
	},

	removePendingImage: (index) => {
		set((state) => ({
			pendingImages: state.pendingImages.filter((_, imageIndex) => imageIndex !== index),
		}));
	},

	clearPendingImages: () => {
		set({ pendingImages: [] });
	},

	clearExpandedTools: () => {
		set({ expandedTools: new Set<string>() });
	},

	setExpandedTools: (updater) => {
		set((state) => {
			const nextValue = resolveUpdater(updater, state.expandedTools);
			return {
				expandedTools: new Set(nextValue),
			};
		});
	},

	addScheduledMessage: (message) => {
		set((state) => ({
			scheduledMessages: [...state.scheduledMessages, message],
		}));
	},

	clearScheduledMessages: () => {
		const cleared = get().scheduledMessages;
		set({ scheduledMessages: [] });
		return cleared;
	},

	consumeScheduledMessage: (text) => {
		const scheduledMessages = get().scheduledMessages;
		const scheduledIndex = scheduledMessages.findIndex((message) => message.kind === "user" && message.text === text);
		if (scheduledIndex === -1) {
			return undefined;
		}

		const scheduledMessage = scheduledMessages[scheduledIndex];
		set({
			scheduledMessages: scheduledMessages.filter((_, index) => index !== scheduledIndex),
		});
		return scheduledMessage;
	},
}));

/** Extract plain text from a tool result, which may be a string, a content array, or an arbitrary object. */
function extractResultText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
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
