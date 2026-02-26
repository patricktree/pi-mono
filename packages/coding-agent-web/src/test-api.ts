import type { RpcResponse, ServerEvent } from "./protocol/types.js";

/**
 * API exposed on `window.__piTestApi` when the app loads with `?test`.
 * Playwright tests use this to configure the TestTransport before connecting.
 */
export interface PiTestApi {
	setHandler(commandType: string, response: RpcResponse): void;
	removeHandler(commandType: string): void;
	emitEvent(event: ServerEvent): void;
	emitEvents(events: ServerEvent[]): void;
	connect(): void;
	disconnect(): void;
}

declare global {
	interface Window {
		__piTestApi?: PiTestApi;
	}
}
