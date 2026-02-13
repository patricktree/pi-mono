import type { ClientCommand, ExtensionUiResponse, RpcResponse, ServerEvent } from "../protocol/types.js";

export type EventListener = (event: ServerEvent) => void;
export type StatusListener = (connected: boolean) => void;

/**
 * Shared interface for real WebSocket and mock transports.
 * Both `WsClient` and `MockTransport` implement this so the rest of the app
 * is transport-agnostic.
 */
export interface Transport {
	connect(): void;
	disconnect(): void;
	isConnected(): boolean;
	onEvent(listener: EventListener): () => void;
	onStatus(listener: StatusListener): () => void;
	request(command: ClientCommand): Promise<RpcResponse>;
	sendExtensionUiResponse(response: ExtensionUiResponse): void;
}
