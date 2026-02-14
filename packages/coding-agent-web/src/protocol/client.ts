import type { Transport } from "../transport/transport.js";
import type {
	ContextUsage,
	ExtensionUiResponse,
	HistoryMessage,
	ImageContent,
	RpcResponse,
	SessionSummary,
} from "./types.js";

export class ProtocolClient {
	private readonly transport: Transport;

	constructor(transport: Transport) {
		this.transport = transport;
	}

	async prompt(message: string, images?: ImageContent[]): Promise<RpcResponse> {
		return this.transport.request({
			type: "prompt",
			message,
			...(images && images.length > 0 ? { images } : {}),
		});
	}

	async abort(): Promise<RpcResponse> {
		return this.transport.request({
			type: "abort",
		});
	}

	async listSessions(scope: "cwd" | "all" = "all"): Promise<SessionSummary[]> {
		const response = await this.transport.request({
			type: "list_sessions",
			scope,
		});
		if (!response.success) {
			throw new Error(response.error ?? "list_sessions failed");
		}
		const data = response.data as { sessions: SessionSummary[] };
		return data.sessions;
	}

	async switchSession(sessionPath: string): Promise<void> {
		const response = await this.transport.request({
			type: "switch_session",
			sessionPath,
		});
		if (!response.success) {
			throw new Error(response.error ?? "switch_session failed");
		}
	}

	async newSession(): Promise<void> {
		const response = await this.transport.request({
			type: "new_session",
		});
		if (!response.success) {
			throw new Error(response.error ?? "new_session failed");
		}
	}

	async getMessages(): Promise<HistoryMessage[]> {
		const response = await this.transport.request({
			type: "get_messages",
		});
		if (!response.success) {
			throw new Error(response.error ?? "get_messages failed");
		}
		const data = response.data as { messages: HistoryMessage[] };
		return data.messages;
	}

	async getState(): Promise<{ sessionId: string; sessionName?: string }> {
		const response = await this.transport.request({
			type: "get_state",
		});
		if (!response.success) {
			throw new Error(response.error ?? "get_state failed");
		}
		const data = response.data as { sessionId: string; sessionName?: string };
		return data;
	}

	async getContextUsage(): Promise<ContextUsage | undefined> {
		const response = await this.transport.request({
			type: "get_context_usage",
		});
		if (!response.success) {
			throw new Error(response.error ?? "get_context_usage failed");
		}
		const data = response.data as { usage?: ContextUsage };
		return data.usage;
	}

	sendExtensionUiResponse(response: ExtensionUiResponse): void {
		this.transport.sendExtensionUiResponse(response);
	}
}
