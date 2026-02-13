import type { Transport } from "../transport/transport.js";
import type { ExtensionUiResponse, RpcResponse } from "./types.js";

export class ProtocolClient {
	private readonly transport: Transport;

	constructor(transport: Transport) {
		this.transport = transport;
	}

	async prompt(message: string): Promise<RpcResponse> {
		return this.transport.request({
			type: "prompt",
			message,
		});
	}

	async abort(): Promise<RpcResponse> {
		return this.transport.request({
			type: "abort",
		});
	}

	sendExtensionUiResponse(response: ExtensionUiResponse): void {
		this.transport.sendExtensionUiResponse(response);
	}
}
