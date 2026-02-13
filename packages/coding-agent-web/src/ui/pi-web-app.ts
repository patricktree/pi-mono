import { css, html, LitElement } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { MockTransport } from "../mock/mock-transport.js";
import { SCENARIOS } from "../mock/scenarios.js";
import { ProtocolClient } from "../protocol/client.js";
import type { ExtensionUiRequestEvent, ServerEvent } from "../protocol/types.js";
import { type AppState, AppStore } from "../state/store.js";
import type { Transport } from "../transport/transport.js";
import { WsClient } from "../transport/ws-client.js";

const LOG_PREFIX = "[pi-web]";

function log(...args: unknown[]): void {
	console.log(LOG_PREFIX, ...args);
}

function warn(...args: unknown[]): void {
	console.warn(LOG_PREFIX, ...args);
}

function error(...args: unknown[]): void {
	console.error(LOG_PREFIX, ...args);
}

@customElement("pi-web-app")
export class PiWebApp extends LitElement {
	@state() private appState: AppState = {
		connected: false,
		streaming: false,
		messages: [],
	};
	@state() private prompt = "";
	@state() private initialized = false;

	@query("#messages") private messagesEl?: HTMLDivElement;
	@query("#prompt") private promptEl?: HTMLTextAreaElement;

	private readonly store = new AppStore();
	private transport?: Transport;
	private protocolClient?: ProtocolClient;
	private unsubscribeStore?: () => void;
	private unsubscribeEvent?: () => void;
	private unsubscribeStatus?: () => void;

	static override styles = css`
		:host {
			display: block;
			height: 100%;
			background: #0d1117;
			color: #c9d1d9;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
			font-size: 14px;
		}

		*,
		*::before,
		*::after {
			box-sizing: border-box;
		}

		#app {
			display: flex;
			flex-direction: column;
			height: 100%;
			max-width: 900px;
			margin: 0 auto;
			padding: 0 16px;
		}

		header {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 12px 0;
			border-bottom: 1px solid #30363d;
		}

		h1 {
			margin: 0;
			font-size: 16px;
			font-weight: 600;
		}

		#status {
			font-size: 12px;
			padding: 2px 8px;
			border-radius: 12px;
		}

		.connected {
			background: #238636;
			color: #ffffff;
		}

		.disconnected {
			background: #f85149;
			color: #ffffff;
		}

		#messages {
			flex: 1;
			overflow-y: auto;
			padding: 16px 0;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		.msg {
			padding: 10px 14px;
			border-radius: 8px;
			white-space: pre-wrap;
			word-break: break-word;
		}

		.msg-user {
			background: #1c2333;
			border: 1px solid #30363d;
		}

		.msg-assistant {
			background: #161b22;
		}

		.msg-thinking {
			color: #8b949e;
			font-style: italic;
			font-size: 13px;
		}

		.msg-tool {
			color: #f0883e;
			font-size: 13px;
			border-left: 3px solid #f0883e;
			padding-left: 12px;
		}

		.msg-error {
			color: #f85149;
		}

		.msg-system {
			color: #8b949e;
			font-size: 12px;
			text-align: center;
		}

		#input-area {
			display: flex;
			gap: 8px;
			padding: 12px 0;
			border-top: 1px solid #30363d;
		}

		#prompt {
			flex: 1;
			background: #161b22;
			color: #c9d1d9;
			border: 1px solid #30363d;
			border-radius: 8px;
			padding: 10px 14px;
			font-size: 14px;
			font-family: inherit;
			resize: none;
			min-height: 44px;
			max-height: 200px;
			outline: none;
		}

		#prompt:focus {
			border-color: #58a6ff;
		}

		button {
			background: #58a6ff;
			color: #ffffff;
			border: none;
			border-radius: 8px;
			padding: 10px 20px;
			font-size: 14px;
			cursor: pointer;
			font-weight: 500;
		}

		button:hover {
			opacity: 0.9;
		}

		button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		#abort-btn {
			background: #f85149;
		}
	`;

	override connectedCallback(): void {
		super.connectedCallback();
		this.unsubscribeStore = this.store.subscribe((state) => {
			this.appState = state;
		});
		this.initClient();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.unsubscribeStore?.();
		this.unsubscribeEvent?.();
		this.unsubscribeStatus?.();
		this.transport?.disconnect();
	}

	override updated(): void {
		if (this.messagesEl) {
			this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		}
		if (this.promptEl) {
			this.promptEl.style.height = "auto";
			this.promptEl.style.height = `${Math.min(this.promptEl.scrollHeight, 200)}px`;
		}
	}

	private initClient(): void {
		const params = new URLSearchParams(window.location.search);
		const mockParam = params.get("mock");
		let mockAutoPrompt: string | undefined;

		if (mockParam !== null) {
			// Mock mode: use synthetic scenarios, no backend needed
			const scenarioName = mockParam || "default";
			const scenario = SCENARIOS[scenarioName] ?? SCENARIOS.default;
			log(`mock mode (scenario: ${scenarioName})`);
			this.transport = new MockTransport(scenario, { log });
			mockAutoPrompt = scenario.autoPrompt;
		} else {
			// Real mode: connect to backend WebSocket
			const wsUrl = getWebSocketUrl();
			this.transport = new WsClient(wsUrl, { log, warn, error });
		}

		this.protocolClient = new ProtocolClient(this.transport);

		this.unsubscribeEvent = this.transport.onEvent((event) => {
			this.logIncomingEvent(event);
			this.store.handleServerEvent(event);
			if (event.type === "extension_ui_request") {
				this.handleExtensionUiRequest(event);
			}
		});

		this.unsubscribeStatus = this.transport.onStatus((connected) => {
			this.store.setConnected(connected);
			// In mock mode, add the synthetic user message when connected
			if (connected && mockAutoPrompt) {
				this.store.addUserMessage(mockAutoPrompt);
				mockAutoPrompt = undefined; // only once
			}
		});

		this.transport.connect();
		this.initialized = true;
		log("client initialized");
	}

	private logIncomingEvent(event: ServerEvent): void {
		if (event.type === "response") {
			log(`response cmd=${event.command} id=${event.id ?? "none"} success=${event.success}`);
			return;
		}
		if (event.type === "message_update") {
			log(`message_update/${event.assistantMessageEvent.type}`);
			return;
		}
		if (event.type === "tool_execution_start" || event.type === "tool_execution_end") {
			log(`${event.type} tool=${event.toolName}`);
			return;
		}
		log(event.type, event);
	}

	private handleExtensionUiRequest(event: ExtensionUiRequestEvent): void {
		if (!this.protocolClient) {
			return;
		}

		switch (event.method) {
			case "confirm": {
				const confirmed = window.confirm(event.message ?? event.title ?? "Confirm?");
				this.protocolClient.sendExtensionUiResponse({
					type: "extension_ui_response",
					id: event.id,
					confirmed,
				});
				return;
			}

			case "input":
			case "editor": {
				const value = window.prompt(event.title ?? "Input", "");
				if (value === null) {
					this.protocolClient.sendExtensionUiResponse({
						type: "extension_ui_response",
						id: event.id,
						cancelled: true,
					});
					return;
				}
				this.protocolClient.sendExtensionUiResponse({
					type: "extension_ui_response",
					id: event.id,
					value,
				});
				return;
			}

			case "select": {
				const value = window.prompt(event.title ?? "Select", "");
				if (value === null) {
					this.protocolClient.sendExtensionUiResponse({
						type: "extension_ui_response",
						id: event.id,
						cancelled: true,
					});
					return;
				}
				this.protocolClient.sendExtensionUiResponse({
					type: "extension_ui_response",
					id: event.id,
					value,
				});
				return;
			}

			default:
				return;
		}
	}

	private async onSend(): Promise<void> {
		if (!this.protocolClient) {
			return;
		}
		const message = this.prompt.trim();
		if (!message || this.appState.streaming || !this.appState.connected) {
			return;
		}

		this.store.addUserMessage(message);
		const size = message.length;
		log(`send prompt (${size} chars)`);

		this.prompt = "";
		try {
			const response = await this.protocolClient.prompt(message);
			if (!response.success) {
				this.store.addErrorMessage(`Command error (${response.command}): ${response.error || "unknown error"}`);
			}
		} catch (sendError) {
			const msg = sendError instanceof Error ? sendError.message : String(sendError);
			this.store.addErrorMessage(`Failed to send prompt: ${msg}`);
		}
	}

	private async onAbort(): Promise<void> {
		if (!this.protocolClient || !this.appState.connected) {
			return;
		}
		log("send abort");
		try {
			await this.protocolClient.abort();
		} catch (abortError) {
			const msg = abortError instanceof Error ? abortError.message : String(abortError);
			this.store.addErrorMessage(`Failed to abort: ${msg}`);
		}
	}

	private onPromptInput(event: Event): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLTextAreaElement)) {
			return;
		}
		this.prompt = target.value;
	}

	private onPromptKeyDown(event: KeyboardEvent): void {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void this.onSend();
		}
	}

	override render() {
		const statusClass = this.appState.connected ? "connected" : "disconnected";
		const statusLabel = this.appState.connected ? "connected" : "disconnected";

		return html`
			<div id="app">
				<header>
					<h1>pi</h1>
					<span id="status" class=${statusClass}>${statusLabel}</span>
				</header>
				<div id="messages">
					${this.appState.messages.map(
						(message) => html`<div class=${`msg msg-${message.kind}`}>${message.text}</div>`,
					)}
					${!this.initialized ? html`<div class="msg msg-system">Initializing...</div>` : ""}
				</div>
				<div id="input-area">
					<textarea
						id="prompt"
						placeholder="Type a message..."
						.rows=${1}
						.value=${this.prompt}
						?disabled=${this.appState.streaming || !this.appState.connected}
						@input=${this.onPromptInput}
						@keydown=${this.onPromptKeyDown}
					></textarea>
					${
						this.appState.streaming
							? html`<button id="abort-btn" @click=${this.onAbort}>Abort</button>`
							: html`<button id="send-btn" @click=${this.onSend}>Send</button>`
					}
				</div>
			</div>
		`;
	}
}

function getWebSocketUrl(): string {
	const params = new URLSearchParams(window.location.search);
	const token = params.get("token");
	const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : "";
	return `${wsProtocol}//${window.location.host}/ws${tokenSuffix}`;
}
