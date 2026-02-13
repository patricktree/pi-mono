import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { Marked } from "marked";
import { MockTransport } from "../mock/mock-transport.js";
import { SCENARIOS } from "../mock/scenarios.js";
import { ProtocolClient } from "../protocol/client.js";
import type { ExtensionUiRequestEvent, ServerEvent, SessionSummary } from "../protocol/types.js";
import { type AppState, AppStore, type ToolStepData, type UiMessage } from "../state/store.js";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group messages into turns: each user message starts a new turn. */
interface Turn {
	user: UiMessage;
	steps: UiMessage[];
}

function lastUserMessage(messages: UiMessage[]): UiMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].kind === "user") return messages[i];
	}
	return undefined;
}

function groupTurns(messages: UiMessage[]): { orphans: UiMessage[]; turns: Turn[] } {
	const orphans: UiMessage[] = [];
	const turns: Turn[] = [];
	let current: Turn | null = null;

	for (const msg of messages) {
		if (msg.kind === "user") {
			current = { user: msg, steps: [] };
			turns.push(current);
		} else if (current) {
			current.steps.push(msg);
		} else {
			orphans.push(msg);
		}
	}

	return { orphans, turns };
}

/** Format a relative time string from an ISO date. */
/** Detect touch-primary devices (phones/tablets) where Enter should insert a newline. */
function isTouchDevice(): boolean {
	return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/** Shorten a path for display: replace home dir with ~ and keep it compact. */
function shortenPath(cwd: string): string {
	return cwd.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

function timeAgo(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@customElement("pi-web-app")
export class PiWebApp extends LitElement {
	@state() private appState: AppState = {
		connected: false,
		streaming: false,
		messages: [],
		sessions: [],
		currentSessionId: null,
		sidebarOpen: false,
	};
	@state() private prompt = "";
	@state() private collapsedTurns = new Set<string>();

	@query("#scroller") private scrollerEl?: HTMLDivElement;
	@query("#prompt") private promptEl?: HTMLTextAreaElement;

	private readonly store = new AppStore();
	private transport?: Transport;
	private protocolClient?: ProtocolClient;
	private unsubscribeStore?: () => void;
	private unsubscribeEvent?: () => void;
	private unsubscribeStatus?: () => void;

	static override styles = css`
		/* ------------------------------------------------------------------ */
		/* Design tokens (opencode-inspired light theme)                      */
		/* ------------------------------------------------------------------ */
		:host {
			--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
			--font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
			--font-size-xs: 12px;
			--font-size-sm: 13px;
			--font-size-base: 14px;
			--font-size-lg: 16px;
			--font-size-xl: 20px;

			--bg-base: #f8f7f7;
			--bg-stronger: #fcfcfc;
			--bg-surface: #ffffff;

			--text-strong: #1a1523;
			--text-base: #4a4553;
			--text-weak: #8b8796;

			--border-base: rgba(11, 6, 0, 0.12);
			--border-weak: rgba(11, 6, 0, 0.07);

			--surface-raised: rgba(0, 0, 0, 0.04);
			--surface-user: #f0efed;

			--accent-green: #30a46c;
			--accent-blue: #0167ff;
			--accent-orange: #f0883e;
			--accent-red: #e5484d;

			--shadow-xs: 0 1px 2px -0.5px rgba(0,0,0,0.04), 0 0.5px 1.5px 0 rgba(0,0,0,0.025), 0 1px 3px 0 rgba(0,0,0,0.05);
			--shadow-input: 0 0 0 1px var(--border-base), 0 1px 2px -1px rgba(19,16,16,0.04), 0 1px 2px 0 rgba(19,16,16,0.06), 0 1px 3px 0 rgba(19,16,16,0.08);
			--shadow-input-focus: 0 0 0 1px var(--accent-blue), 0 0 0 3px rgba(1,103,255,0.15);

			--radius-sm: 6px;
			--radius-md: 8px;
			--radius-lg: 10px;

			--sidebar-width: 300px;

			display: block;
			height: 100%;
			background: var(--bg-base);
			color: var(--text-base);
			font-family: var(--font-sans);
			font-size: var(--font-size-base);
			line-height: 1.6;
			-webkit-font-smoothing: antialiased;
			-moz-osx-font-smoothing: grayscale;
		}

		*,
		*::before,
		*::after {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		/* ------------------------------------------------------------------ */
		/* Layout                                                              */
		/* ------------------------------------------------------------------ */
		#layout {
			display: flex;
			flex-direction: column;
			height: 100%;
			position: relative;
		}

		/* ------------------------------------------------------------------ */
		/* Header                                                              */
		/* ------------------------------------------------------------------ */
		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 8px 16px;
			border-bottom: 1px solid var(--border-weak);
			background: var(--bg-surface);
			flex-shrink: 0;
			min-height: 44px;
		}

		.header-left {
			display: flex;
			align-items: center;
			gap: 10px;
		}

		h1 {
			font-size: var(--font-size-lg);
			font-weight: 600;
			color: var(--text-strong);
			letter-spacing: -0.2px;
		}

		.status-pill {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-size: var(--font-size-xs);
			font-weight: 500;
			padding: 3px 10px;
			border-radius: 999px;
			border: 1px solid var(--border-base);
			background: var(--bg-surface);
			color: var(--text-base);
		}

		.status-dot {
			width: 7px;
			height: 7px;
			border-radius: 50%;
			background: var(--accent-red);
		}

		.status-dot.on {
			background: var(--accent-green);
		}

		/* Hamburger button */
		.btn-hamburger {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			border-radius: var(--radius-sm);
			border: 1px solid var(--border-base);
			background: var(--bg-surface);
			color: var(--text-base);
			cursor: pointer;
			transition: background 0.1s;
			flex-shrink: 0;
		}

		.btn-hamburger:hover {
			background: var(--surface-raised);
		}

		.btn-hamburger svg {
			width: 18px;
			height: 18px;
		}

		/* ------------------------------------------------------------------ */
		/* Sidebar overlay                                                     */
		/* ------------------------------------------------------------------ */
		.sidebar-backdrop {
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.25);
			z-index: 100;
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.2s ease;
		}

		.sidebar-backdrop.open {
			opacity: 1;
			pointer-events: auto;
		}

		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			width: var(--sidebar-width);
			max-width: 85vw;
			background: var(--bg-surface);
			border-right: 1px solid var(--border-weak);
			z-index: 101;
			display: flex;
			flex-direction: column;
			transform: translateX(-100%);
			transition: transform 0.2s ease;
			overflow: hidden;
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.sidebar-header {
			display: flex;
			flex-direction: column;
			gap: 4px;
			padding: 16px 16px 12px;
			border-bottom: 1px solid var(--border-weak);
			flex-shrink: 0;
		}

		.sidebar-title {
			font-size: var(--font-size-lg);
			font-weight: 600;
			color: var(--text-strong);
		}

		.sidebar-cwd {
			font-size: var(--font-size-xs);
			color: var(--text-weak);
			font-family: var(--font-mono);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.btn-new-session {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			margin: 12px 16px;
			padding: 8px 16px;
			border-radius: var(--radius-md);
			border: 1px solid var(--border-base);
			background: var(--bg-surface);
			color: var(--text-strong);
			font-family: var(--font-sans);
			font-size: var(--font-size-sm);
			font-weight: 500;
			cursor: pointer;
			transition: background 0.1s;
			flex-shrink: 0;
		}

		.btn-new-session:hover {
			background: var(--surface-raised);
		}

		.btn-new-session svg {
			width: 14px;
			height: 14px;
		}

		.session-list {
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			padding: 4px 0;
		}

		.session-item {
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 10px 16px;
			cursor: pointer;
			border: none;
			background: none;
			width: 100%;
			text-align: left;
			font-family: var(--font-sans);
			transition: background 0.1s;
		}

		.session-item:hover {
			background: var(--surface-raised);
		}

		.session-item.active {
			background: var(--surface-raised);
		}

		.session-item-name {
			font-size: var(--font-size-sm);
			font-weight: 500;
			color: var(--text-strong);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.session-item-cwd {
			font-size: var(--font-size-xs);
			color: var(--text-weak);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.session-item-meta {
			display: flex;
			align-items: center; 
			gap: 8px;
			font-size: var(--font-size-xs);
			color: var(--text-weak);
		}

		/* ------------------------------------------------------------------ */
		/* Scrollable message area                                             */
		/* ------------------------------------------------------------------ */
		#scroller {
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}

		#content {
			max-width: 800px;
			margin: 0 auto;
			padding: 24px 24px 24px 24px;
			display: flex;
			flex-direction: column;
			gap: 32px;
		}

		@media (max-width: 600px) {
			#content {
				padding: 16px 16px 16px 16px;
				gap: 24px;
			}
		}

		/* ------------------------------------------------------------------ */
		/* Turn (user message + response)                                      */
		/* ------------------------------------------------------------------ */
		.turn {
			display: flex;
			flex-direction: column;
			gap: 18px;
		}

		/* User message */
		.user-msg {
			background: var(--surface-user);
			border-radius: var(--radius-md);
			padding: 12px 16px;
			color: var(--text-strong);
			font-size: var(--font-size-base);
			line-height: 1.7;
			white-space: pre-wrap;
			word-break: break-word;
			overflow: hidden;
		}

		/* Response label */
		.response-label {
			font-size: var(--font-size-sm);
			font-weight: 500;
			color: var(--text-weak);
		}

		/* Steps container (collapsible tool steps) */
		.steps-toggle {
			display: flex;
			align-items: center;
			gap: 8px;
			cursor: pointer;
			border: none;
			background: none;
			padding: 0;
			color: var(--text-weak);
			font-family: var(--font-sans);
			font-size: var(--font-size-sm);
			font-weight: 500;
		}

		.steps-toggle:hover {
			color: var(--text-base);
		}

		.steps-toggle-icon {
			display: inline-flex;
			transition: transform 0.15s ease;
			width: 14px;
			height: 14px;
		}

		.steps-toggle-icon.collapsed {
			transform: rotate(-90deg);
		}

		.steps-inner {
			display: flex;
			flex-direction: column;
			gap: 12px;
			margin-left: 12px;
			padding-left: 12px;
			border-left: 1px solid var(--border-base);
		}

		.steps-inner[hidden] {
			display: none;
		}

		/* Individual step messages */
		.step {
			font-size: var(--font-size-sm);
			line-height: 1.6;
			word-break: break-word;
		}

		.step-thinking {
			color: var(--text-weak);
			font-style: italic;
		}

		/* Tool step — single block per tool invocation, updates in place */
		.tool-step {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}

		.tool-step-header {
			display: flex;
			align-items: center;
			gap: 8px;
			font-family: var(--font-mono);
			font-size: var(--font-size-xs);
			line-height: 1.5;
		}

		.tool-step-name {
			color: var(--accent-orange);
			font-weight: 500;
		}

		.tool-step-args {
			color: var(--text-weak);
			word-break: break-all;
		}

		.tool-step-status {
			display: flex;
			align-items: center;
			gap: 5px;
			font-size: var(--font-size-xs);
			color: var(--text-weak);
		}

		.tool-step-status-icon {
			display: inline-flex;
			width: 14px;
			height: 14px;
			flex-shrink: 0;
		}

		.tool-step-status-icon.done {
			color: var(--accent-green);
		}

		.tool-step-status-icon.error {
			color: var(--accent-red);
		}

		.tool-step-status-icon.running {
			color: var(--accent-blue);
			animation: spin 1s linear infinite;
		}

		@keyframes spin {
			to { transform: rotate(360deg); }
		}

		.tool-step-result {
			font-family: var(--font-mono);
			font-size: var(--font-size-xs);
			color: var(--text-weak);
			line-height: 1.5;
			word-break: break-all;
			max-height: 80px;
			overflow: hidden;
			position: relative;
		}

		.tool-step-result.is-error {
			color: var(--accent-red);
		}

		.step-error {
			color: var(--accent-red);
		}

		.step-system {
			color: var(--text-weak);
			font-size: var(--font-size-xs);
		}

		/* Assistant (final response) message — rendered markdown */
		.step-assistant {
			color: var(--text-strong);
			font-size: var(--font-size-base);
			line-height: 1.8;
		}

		.step-assistant h1 {
			font-size: var(--font-size-xl);
			font-weight: 600;
			color: var(--text-strong);
			margin: 20px 0 8px;
			line-height: 1.3;
		}

		.step-assistant h2 {
			font-size: 18px;
			font-weight: 600;
			color: var(--text-strong);
			margin: 18px 0 6px;
			line-height: 1.3;
		}

		.step-assistant h3 {
			font-size: var(--font-size-lg);
			font-weight: 600;
			color: var(--text-strong);
			margin: 14px 0 4px;
			line-height: 1.4;
		}

		.step-assistant h4,
		.step-assistant h5,
		.step-assistant h6 {
			font-size: var(--font-size-base);
			font-weight: 600;
			color: var(--text-strong);
			margin: 12px 0 4px;
		}

		.step-assistant p {
			margin: 8px 0;
		}

		.step-assistant p:first-child {
			margin-top: 0;
		}

		.step-assistant ul,
		.step-assistant ol {
			margin: 8px 0;
			padding-left: 24px;
		}

		.step-assistant li {
			margin: 4px 0;
			list-style: inherit;
		}

		.step-assistant ul {
			list-style-type: disc;
		}

		.step-assistant ol {
			list-style-type: decimal;
		}

		.step-assistant code {
			font-family: var(--font-mono);
			font-size: var(--font-size-sm);
			background: var(--surface-raised);
			padding: 1px 5px;
			border-radius: 4px;
			color: var(--text-strong);
		}

		.step-assistant pre {
			margin: 12px 0;
			padding: 12px 16px;
			background: var(--surface-raised);
			border-radius: var(--radius-md);
			overflow-x: auto;
		}

		.step-assistant pre code {
			background: none;
			padding: 0;
			border-radius: 0;
			font-size: var(--font-size-sm);
			line-height: 1.5;
		}

		.step-assistant strong {
			font-weight: 600;
			color: var(--text-strong);
		}

		.step-assistant em {
			font-style: italic;
		}

		.step-assistant a {
			color: var(--accent-blue);
			text-decoration: underline;
			text-underline-offset: 2px;
		}

		.step-assistant a:hover {
			opacity: 0.8;
		}

		.step-assistant blockquote {
			margin: 8px 0;
			padding: 4px 16px;
			border-left: 3px solid var(--border-base);
			color: var(--text-weak);
		}

		.step-assistant hr {
			margin: 16px 0;
			border: none;
			border-top: 1px solid var(--border-weak);
		}

		.step-assistant table {
			margin: 12px 0;
			border-collapse: collapse;
			width: 100%;
			font-size: var(--font-size-sm);
		}

		.step-assistant th,
		.step-assistant td {
			padding: 6px 12px;
			border: 1px solid var(--border-base);
			text-align: left;
		}

		.step-assistant th {
			font-weight: 600;
			background: var(--surface-raised);
		}

		/* ------------------------------------------------------------------ */
		/* Prompt dock (pinned to bottom)                                      */
		/* ------------------------------------------------------------------ */
		#prompt-dock {
			position: sticky;
			bottom: 0;
			left: 0;
			right: 0;
			flex-shrink: 0;
			background: var(--bg-stronger);
			padding: 8px 24px 16px;
		}

		#prompt-dock::before {
			content: "";
			position: absolute;
			top: -24px;
			left: 0;
			right: 0;
			height: 24px;
			background: linear-gradient(to bottom, transparent, var(--bg-stronger));
			pointer-events: none;
		}

		@media (max-width: 600px) {
			#prompt-dock {
				padding: 8px 16px 14px;
			}
		}

		.prompt-card {
			max-width: 800px;
			margin: 0 auto;
			border-radius: var(--radius-lg);
			box-shadow: var(--shadow-input);
			background: var(--bg-surface);
			overflow: hidden;
		}

		.prompt-card:focus-within {
			box-shadow: var(--shadow-input-focus);
		}

		#prompt {
			display: block;
			width: 100%;
			border: none;
			outline: none;
			resize: none;
			background: transparent;
			color: var(--text-strong);
			font-family: var(--font-sans);
			font-size: var(--font-size-base);
			line-height: 1.6;
			padding: 12px 16px 4px;
			min-height: 44px;
			max-height: 200px;
		}

		.prompt-toolbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 4px 12px 8px;
		}

		.prompt-info {
			display: flex;
			align-items: center;
			gap: 10px;
			font-size: var(--font-size-sm);
			color: var(--text-weak);
		}

		.prompt-actions {
			display: flex;
			align-items: center;
			gap: 6px;
		}

		/* Buttons */
		.btn-icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			border-radius: var(--radius-sm);
			border: none;
			background: transparent;
			color: var(--text-weak);
			cursor: pointer;
			transition: background 0.1s, color 0.1s;
		}

		.btn-icon:hover {
			background: var(--surface-raised);
			color: var(--text-base);
		}

		.btn-icon:disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}

		.btn-icon:disabled:hover {
			background: transparent;
			color: var(--text-weak);
		}

		.btn-icon svg {
			width: 16px;
			height: 16px;
		}

		.btn-send {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			border-radius: var(--radius-sm);
			border: none;
			background: var(--text-strong);
			color: var(--bg-surface);
			cursor: pointer;
			transition: opacity 0.1s;
		}

		.btn-send:hover {
			opacity: 0.85;
		}

		.btn-send:disabled {
			opacity: 0.3;
			cursor: not-allowed;
		}

		.btn-send svg {
			width: 16px;
			height: 16px;
		}

		.btn-abort {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			height: 28px;
			padding: 0 12px;
			border-radius: var(--radius-sm);
			border: 1px solid var(--accent-red);
			background: transparent;
			color: var(--accent-red);
			font-family: var(--font-sans);
			font-size: var(--font-size-xs);
			font-weight: 500;
			cursor: pointer;
			transition: background 0.1s;
		}

		.btn-abort:hover {
			background: rgba(229, 72, 77, 0.06);
		}

		/* Empty state */
		.empty-state {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 16px;
			padding: 80px 24px;
			text-align: center;
		}

		.empty-logo {
			font-size: 48px;
			font-weight: 700;
			color: var(--border-weak);
			letter-spacing: -1px;
			user-select: none;
		}

		.empty-hint {
			font-size: var(--font-size-sm);
			color: var(--text-weak);
		}

		/* Streaming indicator */
		.streaming-dot {
			display: inline-block;
			width: 6px;
			height: 6px;
			background: var(--accent-blue);
			border-radius: 50%;
			margin-left: 4px;
			vertical-align: middle;
			animation: blink 1s ease-in-out infinite;
		}

		@keyframes blink {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.3; }
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
		if (this.scrollerEl) {
			this.scrollerEl.scrollTop = this.scrollerEl.scrollHeight;
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
			const scenarioName = mockParam || "default";
			const scenario = SCENARIOS[scenarioName] ?? SCENARIOS.default;
			log(`mock mode (scenario: ${scenarioName})`);
			this.transport = new MockTransport(scenario, { log });
			mockAutoPrompt = scenario.autoPrompt;
		} else {
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
			if (event.type === "session_changed") {
				void this.refreshSessionState();
			}
		});

		this.unsubscribeStatus = this.transport.onStatus((connected) => {
			this.store.setConnected(connected);
			if (connected) {
				void this.onConnected(mockAutoPrompt);
				mockAutoPrompt = undefined;
			}
		});

		this.transport.connect();
		log("client initialized");
	}

	/** Called once when connection is established. Resumes the most recently modified session. */
	private async onConnected(mockAutoPrompt?: string): Promise<void> {
		if (!this.protocolClient) return;
		try {
			const [sessionState, sessions] = await Promise.all([
				this.protocolClient.getState(),
				this.protocolClient.listSessions(),
			]);
			this.store.setSessions(sessions);

			// Find the most recently modified session across all CWDs
			const lastSession = sessions.length > 0 ? sessions[0] : undefined; // already sorted by modified desc
			const needsSwitch = lastSession && lastSession.id !== sessionState.sessionId;

			if (needsSwitch) {
				log("resuming last session:", lastSession.id, lastSession.name ?? lastSession.firstMessage);
				await this.protocolClient.switchSession(lastSession.path);
				this.store.setCurrentSessionId(lastSession.id);
			} else {
				this.store.setCurrentSessionId(sessionState.sessionId);
			}

			// Load messages for the (possibly switched) session
			const messages = await this.protocolClient.getMessages();
			if (messages.length > 0) {
				this.store.loadMessagesFromHistory(messages);
			}
			log(
				"session state loaded",
				this.appState.currentSessionId,
				sessions.length,
				"sessions,",
				messages.length,
				"messages",
			);
		} catch (err) {
			log("failed to load session state:", err);
		}
		if (mockAutoPrompt) {
			this.store.addUserMessage(mockAutoPrompt);
		}
	}

	/** Refresh session list and current session after session_changed events. */
	private async refreshSessionState(): Promise<void> {
		if (!this.protocolClient) return;
		try {
			const [sessionState, sessions] = await Promise.all([
				this.protocolClient.getState(),
				this.protocolClient.listSessions(),
			]);
			this.store.setCurrentSessionId(sessionState.sessionId);
			this.store.setSessions(sessions);
		} catch (err) {
			log("failed to refresh session state:", err);
		}
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
		if (!this.protocolClient) return;

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
			case "editor":
			case "select": {
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

			default:
				return;
		}
	}

	// ------------------------------------------------------------------
	// Session actions
	// ------------------------------------------------------------------

	private openSidebar(): void {
		this.store.setSidebarOpen(true);
	}

	private closeSidebar(): void {
		this.store.setSidebarOpen(false);
	}

	private async onNewSession(): Promise<void> {
		if (!this.protocolClient) return;
		this.closeSidebar();
		try {
			await this.protocolClient.newSession();
			this.store.clearMessages();
			this.collapsedTurns = new Set();
			await this.refreshSessionState();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.store.addErrorMessage(`Failed to create session: ${msg}`);
		}
	}

	private async onSwitchSession(session: SessionSummary): Promise<void> {
		if (!this.protocolClient) return;
		if (session.id === this.appState.currentSessionId) {
			this.closeSidebar();
			return;
		}
		this.closeSidebar();
		try {
			await this.protocolClient.switchSession(session.path);
			this.collapsedTurns = new Set();
			await this.refreshSessionState();
			// Load the switched session's message history
			const messages = await this.protocolClient.getMessages();
			if (messages.length > 0) {
				this.store.loadMessagesFromHistory(messages);
			} else {
				this.store.clearMessages();
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.store.addErrorMessage(`Failed to switch session: ${msg}`);
		}
	}

	// ------------------------------------------------------------------
	// Prompt actions
	// ------------------------------------------------------------------

	private async onSend(): Promise<void> {
		if (!this.protocolClient) return;
		const message = this.prompt.trim();
		if (!message || this.appState.streaming || !this.appState.connected) return;

		this.store.addUserMessage(message);
		log(`send prompt (${message.length} chars)`);
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
		if (!this.protocolClient || !this.appState.connected) return;
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
		if (!(target instanceof HTMLTextAreaElement)) return;
		this.prompt = target.value;
	}

	private onPromptKeyDown(event: KeyboardEvent): void {
		// On mobile/touch devices, let Enter insert a newline — users tap the send button instead.
		// On desktop, Enter sends and Shift+Enter inserts a newline.
		if (event.key === "Enter" && !event.shiftKey && !isTouchDevice()) {
			event.preventDefault();
			void this.onSend();
		}
	}

	private toggleTurn(turnId: string): void {
		const next = new Set(this.collapsedTurns);
		if (next.has(turnId)) {
			next.delete(turnId);
		} else {
			next.add(turnId);
		}
		this.collapsedTurns = next;
	}

	// ------------------------------------------------------------------
	// Render
	// ------------------------------------------------------------------

	override render() {
		const { connected, streaming, messages, sidebarOpen, sessions, currentSessionId } = this.appState;
		const { orphans, turns } = groupTurns(messages);
		const hasContent = orphans.length > 0 || turns.length > 0;

		return html`
			${this.renderSidebar(sidebarOpen, sessions, currentSessionId)}

			<div id="layout">
				<header>
					<div class="header-left">
						<button class="btn-hamburger" @click=${this.openSidebar} aria-label="Open sidebar">
							${svgMenu}
						</button>
						<h1>pi</h1>
					</div>
					<div class="status-pill">
						<span class="status-dot ${connected ? "on" : ""}"></span>
						<span>Status</span>
					</div>
				</header>

				<div id="scroller">
					<div id="content">
						${!hasContent ? this.renderEmpty() : nothing}
						${orphans.map((msg) => this.renderStepMessage(msg))}
						${turns.map((turn) => this.renderTurn(turn, streaming))}
					</div>
				</div>

				${this.renderPromptDock(connected, streaming)}
			</div>
		`;
	}

	private renderSidebar(open: boolean, sessions: SessionSummary[], currentSessionId: string | null) {
		return html`
			<div class="sidebar-backdrop ${open ? "open" : ""}" @click=${this.closeSidebar}></div>
			<div class="sidebar ${open ? "open" : ""}">
				<div class="sidebar-header">
					<span class="sidebar-title">pi</span>
				</div>
				<button class="btn-new-session" @click=${() => void this.onNewSession()}>
					${svgPlus} New session
				</button>
				<div class="session-list">
					${sessions.map((s) => this.renderSessionItem(s, s.id === currentSessionId))}
					${sessions.length === 0 ? html`<div style="padding: 16px; color: var(--text-weak); font-size: var(--font-size-sm);">No sessions yet</div>` : nothing}
				</div>
			</div>
		`;
	}

	private renderSessionItem(session: SessionSummary, active: boolean) {
		const displayName = session.name ?? session.firstMessage;
		const truncated = displayName.length > 60 ? `${displayName.slice(0, 60)}...` : displayName;
		const cwd = shortenPath(session.cwd);
		return html`
			<button class="session-item ${active ? "active" : ""}" @click=${() => void this.onSwitchSession(session)}>
				<span class="session-item-name">${truncated}</span>
				<span class="session-item-cwd">${cwd}</span>
				<span class="session-item-meta">
					<span>${session.messageCount} messages</span>
					<span>${timeAgo(session.modified)}</span>
				</span>
			</button>
		`;
	}

	private renderEmpty() {
		return html`
			<div class="empty-state">
				<div class="empty-logo">pi</div>
				<div class="empty-hint">Send a message to get started</div>
			</div>
		`;
	}

	private renderTurn(turn: Turn, streaming: boolean) {
		const steps = turn.steps;
		const toolSteps = steps.filter((s) => s.kind === "tool" || s.kind === "thinking");
		const assistantSteps = steps.filter((s) => s.kind === "assistant");
		const errorSteps = steps.filter((s) => s.kind === "error");
		const systemSteps = steps.filter((s) => s.kind === "system");
		const isCollapsed = this.collapsedTurns.has(turn.user.id);
		const isLatestTurn = turn.user === lastUserMessage(this.appState.messages);
		const showSteps = toolSteps.length > 0;
		const stepCount = toolSteps.length;

		return html`
			<div class="turn">
				<div class="user-msg">${turn.user.text}</div>

				${
					showSteps
						? html`
						<button class="steps-toggle" @click=${() => this.toggleTurn(turn.user.id)}>
							<span class="steps-toggle-icon ${isCollapsed ? "collapsed" : ""}">
								${svgChevronDown}
							</span>
							<span>${stepCount} step${stepCount > 1 ? "s" : ""}</span>
						</button>
						<div class="steps-inner" ?hidden=${isCollapsed}>
							${toolSteps.map((msg) => this.renderStepMessage(msg))}
						</div>
					`
						: nothing
				}

				${errorSteps.length > 0 ? html`${errorSteps.map((msg) => this.renderStepMessage(msg))}` : nothing}

				${
					assistantSteps.length > 0
						? html`
						${assistantSteps.map(
							(msg) => html`
							<div class="step step-assistant">${renderMd(msg.text)}${streaming && isLatestTurn ? html`<span class="streaming-dot"></span>` : nothing}</div>
						`,
						)}
					`
						: nothing
				}

				${
					streaming && isLatestTurn && assistantSteps.length === 0 && errorSteps.length === 0
						? html`<span class="response-label">Thinking<span class="streaming-dot"></span></span>`
						: nothing
				}

				${systemSteps.map((msg) => this.renderStepMessage(msg))}
			</div>
		`;
	}

	private renderStepMessage(msg: UiMessage) {
		switch (msg.kind) {
			case "thinking":
				return html`<div class="step step-thinking">${msg.text}</div>`;
			case "tool":
				return msg.toolStep ? this.renderToolStep(msg.toolStep) : html`<div class="step">${msg.text}</div>`;
			case "error":
				return html`<div class="step step-error">${msg.text}</div>`;
			case "system":
				return html`<div class="step step-system">${msg.text}</div>`;
			case "assistant":
				return html`<div class="step step-assistant">${renderMd(msg.text)}</div>`;
			default:
				return html`<div class="step">${msg.text}</div>`;
		}
	}

	private renderToolStep(step: ToolStepData) {
		return html`
			<div class="step tool-step">
				<div class="tool-step-header">
					<span class="tool-step-name">${step.toolName}</span>
					<span class="tool-step-args">${step.toolArgs}</span>
				</div>
				${this.renderToolStepStatus(step)}
				${step.result && step.phase === "done" ? html`<div class="tool-step-result">${step.result}</div>` : nothing}
				${step.result && step.phase === "error" ? html`<div class="tool-step-result is-error">${step.result}</div>` : nothing}
			</div>
		`;
	}

	private renderToolStepStatus(step: ToolStepData) {
		switch (step.phase) {
			case "calling":
				return html`<div class="tool-step-status">${svgDots}<span>Calling...</span></div>`;
			case "running":
				return html`<div class="tool-step-status"><span class="tool-step-status-icon running">${svgSpinner}</span><span>Running...</span></div>`;
			case "done":
				return html`<div class="tool-step-status"><span class="tool-step-status-icon done">${svgCheck}</span><span>Done</span></div>`;
			case "error":
				return html`<div class="tool-step-status"><span class="tool-step-status-icon error">${svgX}</span><span>Error</span></div>`;
		}
	}

	private renderPromptDock(connected: boolean, streaming: boolean) {
		return html`
			<div id="prompt-dock">
				<div class="prompt-card">
					<textarea
						id="prompt"
						rows="1"
						enterkeyhint="enter"
						.value=${this.prompt}
						?disabled=${streaming || !connected}
						@input=${this.onPromptInput}
						@keydown=${this.onPromptKeyDown}
					></textarea>
					<div class="prompt-toolbar">
						<div class="prompt-info">
							<!-- placeholder for model selector / mode badge -->
						</div>
						<div class="prompt-actions">
							${
								streaming
									? html`<button class="btn-abort" id="abort-btn" @click=${this.onAbort}>Stop</button>`
									: html`
									<button
										class="btn-send"
										id="send-btn"
										?disabled=${!connected || !this.prompt.trim()}
										@click=${this.onSend}
										aria-label="Send"
									>
										${svgArrowUp}
									</button>
								`
							}
						</div>
					</div>
				</div>
			</div>
		`;
	}
}

// ---------------------------------------------------------------------------
// SVG icons (inline, small)
// ---------------------------------------------------------------------------

const svgArrowUp = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;

const svgChevronDown = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

const svgCheck = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

const svgX = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

const svgSpinner = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

const svgDots = html`<span style="letter-spacing:2px;font-size:10px;color:var(--text-weak)">···</span>`;

const svgMenu = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>`;

const svgPlus = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`;

// ---------------------------------------------------------------------------
// Markdown rendering via `marked`
// ---------------------------------------------------------------------------

const md = new Marked({ async: false, gfm: true, breaks: false });

function renderMd(text: string) {
	if (!text) return nothing;
	const rendered = md.parse(text) as string;
	return unsafeHTML(rendered);
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function getWebSocketUrl(): string {
	const params = new URLSearchParams(window.location.search);
	const token = params.get("token");
	const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : "";
	return `${wsProtocol}//${window.location.host}/ws${tokenSuffix}`;
}
