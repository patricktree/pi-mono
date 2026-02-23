import { ChevronDown, ClipboardList, Folder, GitBranch, HelpCircle, LoaderCircle, Menu, MoreHorizontal, Pencil, Plus, Settings, Square, Terminal, Monitor, X } from "lucide-react";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MockTransport } from "./mock/mock-transport.js";
import { SCENARIOS } from "./mock/scenarios.js";
import { ProtocolClient } from "./protocol/client.js";
import type { ExtensionUiRequestEvent, ImageContent, ServerEvent, SessionSummary } from "./protocol/types.js";
import { AppStore, type AppState, type ToolStepData, type UiMessage } from "./state/store.js";
import type { Transport } from "./transport/transport.js";
import { WsClient } from "./transport/ws-client.js";

const LOG_PREFIX = "[pi-web]";
const MARKDOWN = new Marked({ async: false, gfm: true, breaks: false });

const INITIAL_STATE: AppState = {
	connected: false,
	streaming: false,
	messages: [],
	sessions: [],
	currentSessionId: null,
	sidebarOpen: false,
	contextUsage: undefined,
};

interface Turn {
	user: UiMessage;
	steps: UiMessage[];
}

function log(...args: unknown[]): void {
	console.log(LOG_PREFIX, ...args);
}

function warn(...args: unknown[]): void {
	console.warn(LOG_PREFIX, ...args);
}

function error(...args: unknown[]): void {
	console.error(LOG_PREFIX, ...args);
}

function lastUserMessage(messages: UiMessage[]): UiMessage | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index].kind === "user") return messages[index];
	}
	return undefined;
}

function groupTurns(messages: UiMessage[]): { orphans: UiMessage[]; turns: Turn[] } {
	const orphans: UiMessage[] = [];
	const turns: Turn[] = [];
	let current: Turn | null = null;

	for (const message of messages) {
		if (message.kind === "user") {
			current = { user: message, steps: [] };
			turns.push(current);
			continue;
		}
		if (!current) {
			orphans.push(message);
			continue;
		}
		current.steps.push(message);
	}

	return { orphans, turns };
}

function isTouchDevice(): boolean {
	return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

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

function getWebSocketUrl(): string {
	const params = new URLSearchParams(window.location.search);
	const token = params.get("token");
	const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : "";
	return `${wsProtocol}//${window.location.host}/ws${tokenSuffix}`;
}

function readFileAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Failed to read file as base64"));
				return;
			}
			const base64 = result.split(",")[1];
			if (!base64) {
				reject(new Error("Failed to read file as base64"));
				return;
			}
			resolve(base64);
		};
		reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
		reader.readAsDataURL(file);
	});
}

function Markdown({ text }: { text: string }) {
	const html = useMemo(() => {
		if (!text) return "";
		const rendered = MARKDOWN.parse(text) as string;
		return DOMPurify.sanitize(rendered);
	}, [text]);

	return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Derive a session title from the first user message. */
function deriveSessionTitle(messages: UiMessage[]): string | undefined {
	for (const msg of messages) {
		if (msg.kind === "user" && msg.text.trim()) {
			const text = msg.text.trim();
			return text.length > 50 ? `${text.slice(0, 50)}...` : text;
		}
	}
	return undefined;
}

export function App() {
	const [appState, setAppState] = useState<AppState>(INITIAL_STATE);
	const [prompt, setPrompt] = useState("");
	const [collapsedTurns, setCollapsedTurns] = useState<Set<string>>(new Set());
	const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
	const [pendingImages, setPendingImages] = useState<ImageContent[]>([]);
	const [activeTab, setActiveTab] = useState<"session" | "changes">("session");

	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const promptRef = useRef<HTMLTextAreaElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const storeRef = useRef(new AppStore());
	const transportRef = useRef<Transport | undefined>(undefined);
	const protocolRef = useRef<ProtocolClient | undefined>(undefined);

	const refreshContextUsage = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) return;
		try {
			const usage = await protocolClient.getContextUsage();
			storeRef.current.setContextUsage(usage);
		} catch (refreshError) {
			log("failed to fetch context usage:", refreshError);
		}
	}, []);

	const refreshSessionState = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) return;
		try {
			const [sessionState, sessions] = await Promise.all([protocolClient.getState(), protocolClient.listSessions()]);
			storeRef.current.setCurrentSessionId(sessionState.sessionId);
			storeRef.current.setSessions(sessions);
		} catch (refreshError) {
			log("failed to refresh session state:", refreshError);
		}
	}, []);

	const handleExtensionUiRequest = useCallback((event: ExtensionUiRequestEvent) => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) return;

		switch (event.method) {
			case "confirm": {
				const confirmed = window.confirm(event.message ?? event.title ?? "Confirm?");
				protocolClient.sendExtensionUiResponse({
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
					protocolClient.sendExtensionUiResponse({
						type: "extension_ui_response",
						id: event.id,
						cancelled: true,
					});
					return;
				}
				protocolClient.sendExtensionUiResponse({
					type: "extension_ui_response",
					id: event.id,
					value,
				});
				return;
			}
		}
	}, []);

	const onConnected = useCallback(
		async (mockAutoPrompt?: string) => {
			const protocolClient = protocolRef.current;
			if (!protocolClient) return;

			try {
				const [sessionState, sessions] = await Promise.all([protocolClient.getState(), protocolClient.listSessions()]);
				storeRef.current.setSessions(sessions);

				const lastSession = sessions.length > 0 ? sessions[0] : undefined;
				const needsSwitch = lastSession && lastSession.id !== sessionState.sessionId;
				if (needsSwitch) {
					log("resuming last session:", lastSession.id, lastSession.name ?? lastSession.firstMessage);
					await protocolClient.switchSession(lastSession.path);
					storeRef.current.setCurrentSessionId(lastSession.id);
				} else {
					storeRef.current.setCurrentSessionId(sessionState.sessionId);
				}

				const messages = await protocolClient.getMessages();
				if (messages.length > 0) {
					storeRef.current.loadMessagesFromHistory(messages);
				}
				void refreshContextUsage();
			} catch (loadError) {
				log("failed to load session state:", loadError);
			}

			if (mockAutoPrompt) {
				storeRef.current.addUserMessage(mockAutoPrompt);
			}
		},
		[refreshContextUsage],
	);

	useEffect(() => {
		const store = storeRef.current;
		const unsubscribeStore = store.subscribe((state) => {
			setAppState(state);
		});

		const params = new URLSearchParams(window.location.search);
		const mockParam = params.get("mock");
		let mockAutoPrompt: string | undefined;

		let transport: Transport;
		if (mockParam !== null) {
			const scenarioName = mockParam || "default";
			const scenario = SCENARIOS[scenarioName] ?? SCENARIOS.default;
			log(`mock mode (scenario: ${scenarioName})`);
			transport = new MockTransport(scenario, { log });
			mockAutoPrompt = scenario.autoPrompt;
		} else {
			transport = new WsClient(getWebSocketUrl(), { log, warn, error });
		}

		transportRef.current = transport;
		protocolRef.current = new ProtocolClient(transport);

		const unsubscribeEvent = transport.onEvent((event: ServerEvent) => {
			store.handleServerEvent(event);
			if (event.type === "extension_ui_request") {
				handleExtensionUiRequest(event);
			}
			if (event.type === "session_changed") {
				void refreshSessionState();
			}
			if (event.type === "agent_end") {
				void refreshContextUsage();
			}
		});

		const unsubscribeStatus = transport.onStatus((connected) => {
			store.setConnected(connected);
			if (connected) {
				void onConnected(mockAutoPrompt);
				mockAutoPrompt = undefined;
			}
		});

		transport.connect();
		log("client initialized");

		return () => {
			unsubscribeStore();
			unsubscribeEvent();
			unsubscribeStatus();
			transport.disconnect();
			transportRef.current = undefined;
			protocolRef.current = undefined;
		};
	}, [handleExtensionUiRequest, onConnected, refreshContextUsage, refreshSessionState]);

	useEffect(() => {
		if (scrollerRef.current) {
			scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
		}
	}, [appState.messages, appState.streaming]);

	useEffect(() => {
		if (!promptRef.current) return;
		promptRef.current.style.height = "auto";
		promptRef.current.style.height = `${Math.min(promptRef.current.scrollHeight, 200)}px`;
	}, [prompt]);

	const sendPrompt = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) return;

		const message = prompt.trim();
		const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
		if ((!message && !images) || appState.streaming || !appState.connected) return;

		storeRef.current.addUserMessage(message || "(image attachment)", images);
		setPrompt("");
		setPendingImages([]);

		try {
			const response = await protocolClient.prompt(message, images);
			if (!response.success) {
				storeRef.current.addErrorMessage(`Command error (${response.command}): ${response.error || "unknown error"}`);
			}
		} catch (sendError) {
			const messageText = sendError instanceof Error ? sendError.message : String(sendError);
			storeRef.current.addErrorMessage(`Failed to send prompt: ${messageText}`);
		}
	}, [appState.connected, appState.streaming, pendingImages, prompt]);

	const abortPrompt = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient || !appState.connected) return;

		try {
			await protocolClient.abort();
		} catch (abortError) {
			const messageText = abortError instanceof Error ? abortError.message : String(abortError);
			storeRef.current.addErrorMessage(`Failed to abort: ${messageText}`);
		}
	}, [appState.connected]);

	const onPromptKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === "Enter" && !event.shiftKey && !isTouchDevice()) {
				event.preventDefault();
				void sendPrompt();
			}
		},
		[sendPrompt],
	);

	const onAttachImage = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const onFileSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.currentTarget.files;
		if (!files || files.length === 0) return;

		const newImages: ImageContent[] = [];
		for (const file of Array.from(files)) {
			if (!file.type.startsWith("image/")) {
				warn("skipping non-image file:", file.name, file.type);
				continue;
			}
			if (file.size > 20 * 1024 * 1024) {
				storeRef.current.addErrorMessage(`Image too large (max 20 MB): ${file.name}`);
				continue;
			}
			try {
				const base64 = await readFileAsBase64(file);
				newImages.push({ type: "image", data: base64, mimeType: file.type });
			} catch (readError) {
				const messageText = readError instanceof Error ? readError.message : String(readError);
				storeRef.current.addErrorMessage(`Failed to read image: ${messageText}`);
			}
		}

		if (newImages.length > 0) {
			setPendingImages((current) => [...current, ...newImages]);
		}
		event.currentTarget.value = "";
	}, []);

	const onNewSession = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) return;

		storeRef.current.setSidebarOpen(false);
		try {
			await protocolClient.newSession();
			storeRef.current.clearMessages();
			setCollapsedTurns(new Set());
			setExpandedTools(new Set());
			await refreshSessionState();
		} catch (sessionError) {
			const messageText = sessionError instanceof Error ? sessionError.message : String(sessionError);
			storeRef.current.addErrorMessage(`Failed to create session: ${messageText}`);
		}
	}, [refreshSessionState]);

	const onSwitchSession = useCallback(
		async (session: SessionSummary) => {
			const protocolClient = protocolRef.current;
			if (!protocolClient) return;

			if (session.id === appState.currentSessionId) {
				storeRef.current.setSidebarOpen(false);
				return;
			}

			storeRef.current.setSidebarOpen(false);
			try {
				await protocolClient.switchSession(session.path);
				setCollapsedTurns(new Set());
				setExpandedTools(new Set());
				await refreshSessionState();
				const messages = await protocolClient.getMessages();
				if (messages.length > 0) {
					storeRef.current.loadMessagesFromHistory(messages);
				} else {
					storeRef.current.clearMessages();
				}
			} catch (switchError) {
				const messageText = switchError instanceof Error ? switchError.message : String(switchError);
				storeRef.current.addErrorMessage(`Failed to switch session: ${messageText}`);
			}
		},
		[appState.currentSessionId, refreshSessionState],
	);

	const { orphans, turns } = useMemo(() => groupTurns(appState.messages), [appState.messages]);
	const hasContent = orphans.length > 0 || turns.length > 0;
	const latestUserId = useMemo(() => lastUserMessage(appState.messages)?.id, [appState.messages]);
	const sessionTitle = useMemo(() => deriveSessionTitle(appState.messages), [appState.messages]);

	const currentSession = useMemo(() => {
		if (!appState.currentSessionId) return undefined;
		return appState.sessions.find((s) => s.id === appState.currentSessionId);
	}, [appState.currentSessionId, appState.sessions]);

	return (
		<div className="oc-root">
			{/* Sidebar overlay */}
			<div
				className={appState.sidebarOpen ? "oc-overlay oc-overlay--visible" : "oc-overlay"}
				onClick={() => storeRef.current.setSidebarOpen(false)}
			/>

			{/* Sidebar */}
			<aside className={appState.sidebarOpen ? "oc-sidebar oc-sidebar--open" : "oc-sidebar"}>
				{/* Left icon strip */}
				<div className="oc-sidebar__icons">
					<div className="oc-sidebar__icons-top">
						<div className="oc-sidebar__logo-icon">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="3" y="3" width="18" height="18" rx="4" />
								<rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" />
							</svg>
						</div>
						<button className="oc-sidebar__icon-btn" onClick={() => void onNewSession()} type="button" aria-label="New session">
							<Plus size={18} />
						</button>
					</div>
					<div className="oc-sidebar__icons-bottom">
						<button className="oc-sidebar__icon-btn" type="button" aria-label="Settings">
							<Settings size={18} />
						</button>
						<button className="oc-sidebar__icon-btn" type="button" aria-label="Help">
							<HelpCircle size={18} />
						</button>
					</div>
				</div>

				{/* Right content panel */}
				<div className="oc-sidebar__content">
					<div className="oc-sidebar__project">
						<div className="oc-sidebar__project-info">
							<span className="oc-sidebar__project-name">pi</span>
							<span className="oc-sidebar__project-path">{currentSession ? shortenPath(currentSession.cwd) : "~/workspace"}</span>
						</div>
						<button className="oc-icon-btn" type="button">
							<MoreHorizontal size={16} />
						</button>
					</div>

					<button className="oc-sidebar__new-session" onClick={() => void onNewSession()} type="button">
						<Plus size={16} />
						New session
					</button>

					<div className="oc-sidebar__sessions">
						{appState.sessions.length === 0 ? (
							<p className="oc-sidebar__empty">No sessions yet</p>
						) : null}
						{appState.sessions.map((session) => {
							const displayName = session.name ?? session.firstMessage;
							const truncated = displayName.length > 20 ? `${displayName.slice(0, 20)}...` : displayName;
							const active = session.id === appState.currentSessionId;
							return (
								<button
									className={active ? "oc-sidebar__session oc-sidebar__session--active" : "oc-sidebar__session"}
									onClick={() => void onSwitchSession(session)}
									type="button"
									key={session.id}
								>
									<span className="oc-sidebar__session-dash">—</span>
									<span className="oc-sidebar__session-name">{truncated}</span>
									<ClipboardList size={14} className="oc-sidebar__session-icon" />
								</button>
							);
						})}
					</div>

					<div className="oc-sidebar__getting-started">
						<p className="oc-sidebar__getting-started-title">Getting started</p>
						<p className="oc-sidebar__getting-started-text">
							OpenCode includes free models so you can start immediately.
							{"\n\n"}
							Connect any provider to use models, inc. Claude, GPT, Gemini etc.
						</p>
						<button className="oc-sidebar__connect-btn" type="button">
							<Plus size={14} />
							Connect provider
						</button>
					</div>
				</div>
			</aside>

			{/* Header */}
			<header className="oc-header">
				<button
					className="oc-header__menu-btn"
					onClick={() => storeRef.current.setSidebarOpen(true)}
					type="button"
					aria-label="Open sidebar"
				>
					<Menu size={18} />
				</button>
				<div className="oc-header__actions">
					<button className="oc-status-badge" type="button">
						<span className={appState.connected ? "oc-status-dot oc-status-dot--ok" : "oc-status-dot oc-status-dot--err"} />
						Status
					</button>
					{hasContent ? (
						<button className="oc-share-btn" type="button">
							Share
						</button>
					) : null}
				</div>
			</header>

			{/* Tabs (only when there's content) */}
			{hasContent ? (
				<div className="oc-tabs">
					<button
						className={activeTab === "session" ? "oc-tab oc-tab--active" : "oc-tab"}
						onClick={() => setActiveTab("session")}
						type="button"
					>
						Session
					</button>
					<button
						className={activeTab === "changes" ? "oc-tab oc-tab--active" : "oc-tab"}
						onClick={() => setActiveTab("changes")}
						type="button"
					>
						Changes
					</button>
				</div>
			) : null}

			{/* Main content area */}
			<div className="oc-content" ref={scrollerRef}>
				{activeTab === "session" ? (
					<div className="oc-session">
						{!hasContent ? (
							<EmptyState cwd={currentSession?.cwd} />
						) : (
							<>
								{/* Session title bar */}
								{sessionTitle ? (
									<div className="oc-session-title">
										<span className="oc-session-title__text">{sessionTitle}</span>
										<div className="oc-session-title__actions">
											{appState.streaming ? (
												<span className="oc-spinner" />
											) : null}
											<button className="oc-icon-btn" type="button">
												<MoreHorizontal size={16} />
											</button>
										</div>
									</div>
								) : null}

								{orphans.map((message) => (
									<div className="oc-orphan" key={message.id}>
										{renderStep(message, expandedTools, setExpandedTools)}
									</div>
								))}

								{turns.map((turn) => {
									const toolSteps = turn.steps.filter((step) => step.kind === "tool");
									const assistantSteps = turn.steps.filter((step) => step.kind === "assistant");
									const errorSteps = turn.steps.filter((step) => step.kind === "error");
									const systemSteps = turn.steps.filter((step) => step.kind === "system");
									const isLatestTurn = turn.user.id === latestUserId;

									return (
										<div className="oc-turn" key={turn.user.id}>
											{/* User message - right aligned pill */}
											<div className="oc-user-msg-row">
												<div className="oc-user-msg">
													{turn.user.text}
													{turn.user.images && turn.user.images.length > 0 ? (
														<div className="oc-user-msg__images">
															{turn.user.images.map((image, index) => (
																<div className="oc-user-msg__image" key={`${turn.user.id}-${index.toString()}`}>
																	<img
																		alt="attached"
																		src={`data:${image.mimeType};base64,${image.data}`}
																	/>
																</div>
															))}
														</div>
													) : null}
												</div>
											</div>

											{/* Thinking indicator - only show during streaming when no other output yet */}
											{appState.streaming && isLatestTurn && assistantSteps.length === 0 && errorSteps.length === 0 && toolSteps.length === 0 ? (
												<p className="oc-thinking">Thinking</p>
											) : null}

											{/* Tool steps */}
											{toolSteps.map((message) => (
												<div key={message.id}>
													{renderStep(message, expandedTools, setExpandedTools)}
												</div>
											))}

											{/* Error steps */}
											{errorSteps.map((message) => (
												<div key={message.id}>{renderStep(message, expandedTools, setExpandedTools)}</div>
											))}

											{/* Assistant response */}
											{assistantSteps.map((message) => (
												<div className="oc-assistant" key={message.id}>
													<Markdown text={message.text} />
													{appState.streaming && isLatestTurn ? (
														<span className="oc-cursor" />
													) : null}
												</div>
											))}

											{/* Thinking with no tool/assistant yet */}
											{appState.streaming && isLatestTurn && assistantSteps.length === 0 && errorSteps.length === 0 && toolSteps.length > 0 ? null : null}

											{systemSteps.map((message) => (
												<div key={message.id}>{renderStep(message, expandedTools, setExpandedTools)}</div>
											))}
										</div>
									);
								})}
							</>
						)}
					</div>
				) : (
					<div className="oc-changes">
						<div className="oc-changes__header">
							<button className="oc-changes__scope" type="button">
								Session changes
								<ChevronDown size={14} />
							</button>
						</div>
						<div className="oc-changes__empty">
							<div className="oc-changes__empty-icon">
								<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
									<rect x="4" y="3" width="16" height="18" rx="2" />
									<rect x="8" y="7" width="8" height="10" rx="1" fill="currentColor" opacity="0.15" />
								</svg>
							</div>
							<p>No changes in this session yet</p>
						</div>
					</div>
				)}
			</div>

			{/* Footer: prompt input + toolbar */}
			<footer className="oc-footer">
				<div className="oc-prompt-container">
					<input
						accept="image/*"
						className="oc-hidden"
						id="image-attachments"
						multiple
						name="imageAttachments"
						onChange={(event) => {
							void onFileSelected(event);
						}}
						ref={fileInputRef}
						type="file"
					/>

					{pendingImages.length > 0 ? (
						<div className="oc-pending-images">
							{pendingImages.map((image, index) => (
								<div className="oc-pending-image" key={`${index.toString()}-${image.mimeType}`}>
									<img
										alt="pending"
										src={`data:${image.mimeType};base64,${image.data}`}
									/>
									<button
										className="oc-pending-image__remove"
										onClick={() => {
											setPendingImages((current) => current.filter((_, i) => i !== index));
										}}
										type="button"
									>
										<X size={10} />
									</button>
								</div>
							))}
						</div>
					) : null}

					<textarea
						className="oc-prompt-input"
						disabled={appState.streaming || !appState.connected}
						onChange={(event) => setPrompt(event.currentTarget.value)}
						onKeyDown={onPromptKeyDown}
						placeholder={hasContent ? "Ask anything..." : 'Ask anything... "Help me write a migration script"'}
						ref={promptRef}
						rows={1}
						value={prompt}
					/>

					{appState.streaming ? (
						<div className="oc-prompt-stop-row">
							<button className="oc-stop-btn" onClick={() => void abortPrompt()} type="button">
								Stop
								<span className="oc-stop-btn__key">ESC</span>
							</button>
						</div>
					) : null}

					<div className="oc-prompt-actions">
						<div className="oc-prompt-actions__right">
							<button
								className="oc-icon-btn"
								disabled={appState.streaming || !appState.connected}
								onClick={onAttachImage}
								type="button"
								aria-label="Attach image"
							>
								<Plus size={18} />
							</button>
							{appState.streaming ? (
								<button
									className="oc-send-btn oc-send-btn--stop"
									onClick={() => void abortPrompt()}
									type="button"
								>
									<Square size={14} />
								</button>
							) : (
								<button
									className={prompt.trim() || pendingImages.length > 0 ? "oc-send-btn oc-send-btn--active" : "oc-send-btn"}
									disabled={!appState.connected || (!prompt.trim() && pendingImages.length === 0)}
									onClick={() => void sendPrompt()}
									type="button"
									aria-label="Send"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
										<line x1="12" y1="19" x2="12" y2="5" />
										<polyline points="5 12 12 5 19 12" />
									</svg>
								</button>
							)}
						</div>
					</div>
				</div>

				{/* Bottom toolbar */}
				<div className="oc-toolbar">
					<button className="oc-toolbar__item" type="button">
						Build
						<ChevronDown size={12} />
					</button>
					<button className="oc-toolbar__item" type="button">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M12 2L2 7l10 5 10-5-10-5z" />
							<path d="M2 17l10 5 10-5" />
							<path d="M2 12l10 5 10-5" />
						</svg>
						Big Pickle
						<ChevronDown size={12} />
					</button>
					<button className="oc-toolbar__item" type="button">
						Default
						<ChevronDown size={12} />
					</button>
					<div className="oc-toolbar__spacer" />
					<button className="oc-icon-btn oc-toolbar__icon" type="button">
						<Terminal size={16} />
					</button>
					<button className="oc-icon-btn oc-toolbar__icon" type="button">
						<Monitor size={16} />
					</button>
				</div>
			</footer>
		</div>
	);
}

function EmptyState({ cwd }: { cwd?: string }) {
	return (
		<div className="oc-empty">
			<h2 className="oc-empty__title">New session</h2>
			<div className="oc-empty__info">
				<div className="oc-empty__row">
					<Folder size={16} />
					<span className="oc-empty__path">
						{cwd ? (
							<>
								{cwd.replace(/\/[^/]+$/, "/")}<strong>{cwd.split("/").pop()}</strong>
							</>
						) : (
							<>~/workspace/<strong>project</strong></>
						)}
					</span>
				</div>
				<div className="oc-empty__row">
					<GitBranch size={16} />
					<span>Main branch (dev)</span>
				</div>
				<div className="oc-empty__row">
					<Pencil size={16} />
					<span>Last modified <strong>3 minutes ago</strong></span>
				</div>
			</div>
		</div>
	);
}

function renderStep(
	message: UiMessage,
	expandedTools: Set<string>,
	setExpandedTools: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
	switch (message.kind) {
		case "thinking":
			// In opencode style, thinking content is not displayed to the user
			return null;
		case "tool":
			return message.toolStep ? (
				<ToolStep step={message.toolStep} messageId={message.id} expandedTools={expandedTools} setExpandedTools={setExpandedTools} />
			) : (
				<p className="oc-step-text">{message.text}</p>
			);
		case "error":
			return <p className="oc-error">{message.text}</p>;
		case "system":
			return <p className="oc-system">{message.text}</p>;
		case "assistant":
			return <Markdown text={message.text} />;
		default:
			return <p className="oc-step-text">{message.text}</p>;
	}
}

function ToolStep({
	step,
	messageId,
	expandedTools,
	setExpandedTools,
}: {
	step: ToolStepData;
	messageId: string;
	expandedTools: Set<string>;
	setExpandedTools: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
	const isExpanded = expandedTools.has(messageId);
	const toolLabel = getToolLabel(step.toolName);
	const toolDescription = getToolDescription(step);

	return (
		<div className="oc-tool">
			<button
				className="oc-tool__header"
				onClick={() => {
					setExpandedTools((prev) => {
						const next = new Set(prev);
						if (next.has(messageId)) {
							next.delete(messageId);
						} else {
							next.add(messageId);
						}
						return next;
					});
				}}
				type="button"
			>
				<span className="oc-tool__label">{toolLabel}</span>
				<span className="oc-tool__desc">{toolDescription}</span>
				{step.phase === "running" ? (
					<LoaderCircle size={14} className="oc-spin oc-tool__spinner" />
				) : null}
				{isExpanded ? (
					<ChevronDown size={14} className="oc-tool__chevron" />
				) : null}
			</button>
			{isExpanded ? (
				<div className="oc-tool__body">
					<pre className="oc-tool__code">
						<code>{formatToolCall(step)}</code>
						{step.result ? (
							<>
								{"\n\n"}
								<code>{step.result}</code>
							</>
						) : null}
					</pre>
				</div>
			) : null}
		</div>
	);
}

function getToolLabel(toolName: string): string {
	switch (toolName) {
		case "bash":
			return "Shell";
		case "read":
			return "Read";
		case "write":
			return "Write";
		case "edit":
			return "Edit";
		case "glob":
			return "Glob";
		case "grep":
			return "Grep";
		default:
			return toolName;
	}
}

function getToolDescription(step: ToolStepData): string {
	try {
		const args = JSON.parse(step.toolArgs);
		if (step.toolName === "bash" && args.command) {
			return args.command.length > 40 ? `${args.command.slice(0, 40)}...` : args.command;
		}
		if (step.toolName === "read" && args.path) {
			return args.path;
		}
		if (step.toolName === "write" && args.path) {
			return args.path;
		}
		if (step.toolName === "edit" && args.path) {
			return args.path;
		}
		if (step.toolName === "glob" && args.pattern) {
			return args.pattern;
		}
		if (step.toolName === "grep" && args.pattern) {
			return args.pattern;
		}
	} catch {
		// ignore parse errors
	}
	return step.toolArgs.length > 40 ? `${step.toolArgs.slice(0, 40)}...` : step.toolArgs;
}

function formatToolCall(step: ToolStepData): string {
	if (step.toolName === "bash") {
		try {
			const args = JSON.parse(step.toolArgs);
			if (args.command) return `$ ${args.command}`;
		} catch {
			// ignore
		}
	}
	return `${step.toolName}(${step.toolArgs})`;
}
