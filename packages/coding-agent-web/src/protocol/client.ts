import type { Transport } from "../transport/transport.js";
import type {
	BashResult,
	ClientCommand,
	ContextUsage,
	DirectoryEntry,
	ExtensionUiResponse,
	HistoryMessage,
	ImageContent,
	RpcResponse,
	RpcResponseFor,
	SessionSummary,
	ThinkingLevel,
} from "./types.js";

export class ProtocolClient {
	private readonly transport: Transport;

	constructor(transport: Transport) {
		this.transport = transport;
	}

	/**
	 * Send a command and narrow the response to the matching command type.
	 * The cast is safe: the protocol guarantees the server returns the correct
	 * data shape for each command.
	 */
	private async typedRequest<C extends ClientCommand>(command: C): Promise<RpcResponseFor<C["type"]>> {
		return this.transport.request(command) as Promise<RpcResponseFor<C["type"]>>;
	}

	async prompt(
		message: string,
		options?: { images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" },
	): Promise<RpcResponse> {
		return this.transport.request({
			type: "prompt",
			message,
			...(options?.images && options.images.length > 0 ? { images: options.images } : {}),
			...(options?.streamingBehavior ? { streamingBehavior: options.streamingBehavior } : {}),
		});
	}

	async abort(): Promise<RpcResponse> {
		return this.transport.request({
			type: "abort",
		});
	}

	async clearQueue(): Promise<RpcResponse> {
		return this.transport.request({
			type: "clear_queue",
		});
	}

	async listSessions(scope: "cwd" | "all" = "all"): Promise<SessionSummary[]> {
		const response = await this.typedRequest({
			type: "list_sessions" as const,
			scope,
		});
		if (!response.success) {
			throw new Error(response.error);
		}
		return response.data.sessions;
	}

	async switchSession(sessionPath: string): Promise<void> {
		const response = await this.typedRequest({
			type: "switch_session" as const,
			sessionPath,
		});
		if (!response.success) {
			throw new Error(response.error);
		}
	}

	async newSession(cwd?: string): Promise<void> {
		const response = await this.typedRequest({
			type: "new_session" as const,
			...(cwd ? { cwd } : {}),
		});
		if (!response.success) {
			throw new Error(response.error);
		}
	}

	async listDirectory(path: string): Promise<{ absolutePath: string; entries: DirectoryEntry[] }> {
		const response = await this.typedRequest({
			type: "list_directory" as const,
			path,
		});
		if (!response.success) {
			throw new Error(response.error);
		}
		return response.data;
	}

	async getMessages(): Promise<HistoryMessage[]> {
		const response = await this.typedRequest({ type: "get_messages" as const });
		if (!response.success) {
			throw new Error(response.error);
		}
		return response.data.messages;
	}

	async getState(): Promise<{ sessionId: string; sessionName?: string; thinkingLevel?: ThinkingLevel }> {
		const response = await this.typedRequest({ type: "get_state" as const });
		if (!response.success) {
			throw new Error(response.error);
		}
		return response.data;
	}

	async setThinkingLevel(level: ThinkingLevel): Promise<void> {
		const response = await this.typedRequest({
			type: "set_thinking_level" as const,
			level,
		});
		if (!response.success) {
			throw new Error(response.error);
		}
	}

	async getContextUsage(): Promise<ContextUsage | undefined> {
		const response = await this.typedRequest({ type: "get_context_usage" as const });
		if (!response.success) {
			throw new Error(response.error);
		}
		return response.data.usage;
	}

	async bash(command: string): Promise<BashResult> {
		const response = await this.typedRequest({
			type: "bash" as const,
			command,
		});
		if (!response.success) {
			throw new Error(response.error);
		}
		return response.data;
	}

	async abortBash(): Promise<void> {
		const response = await this.typedRequest({ type: "abort_bash" as const });
		if (!response.success) {
			throw new Error(response.error);
		}
	}

	sendExtensionUiResponse(response: ExtensionUiResponse): void {
		this.transport.sendExtensionUiResponse(response);
	}

	async sendA2uiAction(surfaceId: string, actionName: string, context: Record<string, unknown>): Promise<void> {
		const response = await this.typedRequest({
			type: "a2ui_action" as const,
			surfaceId,
			actionName,
			context,
		});
		if (!response.success) {
			throw new Error(response.error);
		}
	}
}
