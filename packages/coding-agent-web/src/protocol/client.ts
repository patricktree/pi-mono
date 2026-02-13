import type { WsClient } from "../transport/ws-client.js";
import type { ExtensionUiResponse, RpcResponse } from "./types.js";

export class ProtocolClient {
	private readonly wsClient: WsClient;

	constructor(wsClient: WsClient) {
		this.wsClient = wsClient;
	}

	async prompt(message: string): Promise<RpcResponse> {
		return this.wsClient.request({
			type: "prompt",
			message,
		});
	}

	async abort(): Promise<RpcResponse> {
		return this.wsClient.request({
			type: "abort",
		});
	}

	sendExtensionUiResponse(response: ExtensionUiResponse): void {
		this.wsClient.sendExtensionUiResponse(response);
	}
}
