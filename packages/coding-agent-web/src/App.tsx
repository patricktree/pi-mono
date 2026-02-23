import { ChevronDown, ClipboardList, Folder, GitBranch, HelpCircle, LoaderCircle, Menu, MoreHorizontal, Pencil, Plus, Settings, Square, Terminal, Monitor, X } from "lucide-react";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "./lib/utils.js";
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

/** Reusable class strings for repeated button patterns. */
const SIDEBAR_ICON_BTN =
	"inline-flex items-center justify-center w-9 h-9 rounded-lg text-oc-fg-muted cursor-pointer hover:bg-oc-muted-bg hover:text-oc-fg";
const ICON_BTN =
	"inline-flex items-center justify-center w-8 h-8 rounded-md text-oc-fg-muted cursor-pointer shrink-0 hover:bg-oc-muted-bg hover:text-oc-fg disabled:opacity-40 disabled:cursor-default";
const TOOLBAR_ITEM =
	"inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[13px] font-medium text-oc-fg-muted cursor-pointer whitespace-nowrap hover:text-oc-fg hover:bg-oc-muted-bg [&_svg]:shrink-0";

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
			return text;
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
		<div className="flex flex-col h-full relative overflow-hidden">
			{/* Sidebar overlay */}
			<div
				className={cn(
					"fixed inset-0 z-40 pointer-events-none transition-colors duration-200",
					appState.sidebarOpen && "bg-black/20 backdrop-blur-[1px] pointer-events-auto",
				)}
				onClick={() => storeRef.current.setSidebarOpen(false)}
			/>

			{/* Sidebar */}
			<aside
				className={cn(
					"fixed inset-y-0 left-0 z-50 w-[356px] max-w-[90vw] bg-oc-card border-r border-oc-border flex flex-row -translate-x-full transition-transform duration-[250ms] ease-in-out",
					appState.sidebarOpen && "translate-x-0",
				)}
			>
				{/* Left icon strip */}
				<div className="w-14 shrink-0 flex flex-col items-center py-4 gap-1 border-r border-oc-border-light">
					<div className="flex flex-col items-center gap-1">
						<div className="w-9 h-9 flex items-center justify-center border-2 border-oc-fg rounded-lg mb-1">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="3" y="3" width="18" height="18" rx="4" />
								<rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" />
							</svg>
						</div>
						<button className={SIDEBAR_ICON_BTN} onClick={() => void onNewSession()} type="button" aria-label="New session">
							<Plus size={18} />
						</button>
					</div>
					<div className="mt-auto flex flex-col items-center gap-1">
						<button className={SIDEBAR_ICON_BTN} type="button" aria-label="Settings">
							<Settings size={18} />
						</button>
						<button className={SIDEBAR_ICON_BTN} type="button" aria-label="Help">
							<HelpCircle size={18} />
						</button>
					</div>
				</div>

				{/* Right content panel */}
				<div className="flex-1 min-w-0 flex flex-col overflow-hidden">
					<div className="flex items-start justify-between px-4 pt-4 pb-3">
						<div className="flex flex-col gap-0.5 min-w-0">
							<span className="font-semibold text-[15px]">pi</span>
							<span className="text-xs text-oc-fg-muted truncate">{currentSession ? shortenPath(currentSession.cwd) : "~/workspace"}</span>
						</div>
						<button className={ICON_BTN} type="button">
							<MoreHorizontal size={16} />
						</button>
					</div>

					<button
						className="flex items-center gap-2 mx-3 mb-2 px-3 py-2 border border-oc-border rounded-oc bg-oc-card text-sm font-medium cursor-pointer justify-center hover:bg-oc-muted-bg"
						onClick={() => void onNewSession()}
						type="button"
					>
						<Plus size={16} />
						New session
					</button>

					<div className="flex-1 min-h-0 overflow-y-auto px-2">
						{appState.sessions.length === 0 ? (
							<p className="px-3 py-2 text-[13px] text-oc-fg-muted">No sessions yet</p>
						) : null}
						{appState.sessions.map((session) => {
							const displayName = session.name ?? session.firstMessage;
							const truncated = displayName.length > 20 ? `${displayName.slice(0, 20)}...` : displayName;
							const active = session.id === appState.currentSessionId;
							return (
								<button
									className={cn(
										"flex items-center gap-2 w-full py-1.5 px-3 rounded-md text-left text-[13px] text-oc-fg cursor-pointer hover:bg-oc-muted-bg",
										active && "bg-oc-muted-bg",
									)}
									onClick={() => void onSwitchSession(session)}
									type="button"
									key={session.id}
								>
									<span className="text-oc-fg-faint shrink-0">—</span>
									<span className="truncate flex-1 min-w-0">{truncated}</span>
									<ClipboardList size={14} className="shrink-0 text-oc-fg-faint" />
								</button>
							);
						})}
					</div>

					<div className="mx-3 mt-2 mb-3 p-4 border border-oc-border rounded-oc bg-oc-card">
						<p className="font-semibold text-sm mb-2">Getting started</p>
						<p className="text-[13px] text-oc-fg-muted leading-normal mb-3">
							OpenCode includes free models so you can start immediately.
							{"\n\n"}
							Connect any provider to use models, inc. Claude, GPT, Gemini etc.
						</p>
						<button
							className="flex items-center gap-1.5 py-2 px-3 border border-oc-border rounded-lg bg-oc-card text-[13px] font-medium text-oc-fg w-full justify-start cursor-pointer hover:bg-oc-muted-bg"
							type="button"
						>
							<Plus size={14} />
							Connect provider
						</button>
					</div>
				</div>
			</aside>

			{/* Header */}
			<header className="flex items-center justify-between h-12 px-3 border-b border-oc-border bg-oc-card shrink-0">
				<button
					className={SIDEBAR_ICON_BTN}
					onClick={() => storeRef.current.setSidebarOpen(true)}
					type="button"
					aria-label="Open sidebar"
				>
					<Menu size={18} />
				</button>
				<div className="flex items-center gap-2">
					<button className="inline-flex items-center gap-2 px-3.5 py-1.5 border border-oc-border rounded-full bg-oc-card text-[13px] font-medium text-oc-fg cursor-pointer hover:bg-oc-muted-bg" type="button">
						<span className={cn("w-2 h-2 rounded-full", appState.connected ? "bg-oc-accent" : "bg-oc-error")} />
						Status
					</button>
					{hasContent ? (
						<button className="inline-flex items-center px-3.5 py-1.5 border border-oc-border rounded-lg bg-oc-card text-[13px] font-medium text-oc-fg cursor-pointer hover:bg-oc-muted-bg" type="button">
							Share
						</button>
					) : null}
				</div>
			</header>

			{/* Tabs (only when there's content) */}
			{hasContent ? (
				<div className="flex border-b border-oc-border bg-oc-card shrink-0">
					<button
						className={cn(
							"flex-1 py-2.5 text-sm font-medium text-oc-fg-muted cursor-pointer text-center border-b-2 border-b-transparent -mb-px hover:text-oc-fg",
							activeTab === "session" && "text-oc-fg border-b-oc-fg",
						)}
						onClick={() => setActiveTab("session")}
						type="button"
					>
						Session
					</button>
					<button
						className={cn(
							"flex-1 py-2.5 text-sm font-medium text-oc-fg-muted cursor-pointer text-center border-b-2 border-b-transparent -mb-px hover:text-oc-fg",
							activeTab === "changes" && "text-oc-fg border-b-oc-fg",
						)}
						onClick={() => setActiveTab("changes")}
						type="button"
					>
						Changes
					</button>
				</div>
			) : null}

			{/* Session title bar — sticky below tabs */}
			{hasContent && sessionTitle ? (
				<div className="flex items-center justify-between px-4 py-2 gap-2 border-b border-oc-border bg-oc-card shrink-0">
					<span className="text-[13px] font-medium text-oc-fg-muted flex-1 min-w-0 truncate">{sessionTitle}</span>
					<div className="flex items-center gap-1 shrink-0">
						{appState.streaming ? (
							<span className="w-4 h-4 border-[1.5px] border-oc-border border-t-oc-fg-faint rounded-full animate-oc-spinner" />
						) : null}
						<button className={ICON_BTN} type="button">
							<MoreHorizontal size={16} />
						</button>
					</div>
				</div>
			) : null}

			{/* Main content area */}
			<div className="flex-1 min-h-0 overflow-y-auto" ref={scrollerRef}>
				{activeTab === "session" ? (
					<div className="flex flex-col min-h-full">
						{!hasContent ? (
							<EmptyState cwd={currentSession?.cwd} />
						) : (
							<>
								{orphans.map((message) => (
									<div className="px-4" key={message.id}>
										{renderStep(message, expandedTools, setExpandedTools)}
									</div>
								))}

								{turns.map((turn) => {
									const isLatestTurn = turn.user.id === latestUserId;
									const hasOutput = turn.steps.some((s) => s.kind === "assistant" || s.kind === "error" || s.kind === "tool");

									return (
										<div className="flex flex-col gap-4 px-4 pb-5" key={turn.user.id}>
											{/* User message - right aligned pill */}
											<div className="flex">
												<div className="max-w-[85%] px-4 py-2.5 bg-oc-user-bg border border-oc-user-border rounded-oc text-sm leading-normal text-oc-fg whitespace-pre-wrap break-words">
													{turn.user.text}
													{turn.user.images && turn.user.images.length > 0 ? (
														<div className="flex flex-wrap gap-2 mt-2">
															{turn.user.images.map((image, index) => (
																<div className="w-16 h-16 overflow-hidden rounded-md border border-oc-border" key={`${turn.user.id}-${index.toString()}`}>
																	<img
																		alt="attached"
																		src={`data:${image.mimeType};base64,${image.data}`}
																		className="w-full h-full object-cover"
																	/>
																</div>
															))}
														</div>
													) : null}
												</div>
											</div>

											{/* Thinking indicator - only show during streaming when no other output yet */}
											{appState.streaming && isLatestTurn && !hasOutput ? (
												<p className="text-sm text-oc-fg-muted">Thinking</p>
											) : null}

											{/* Steps rendered in original order to preserve interleaving */}
											{turn.steps.map((message) => {
												if (message.kind === "assistant") {
													return (
														<div className="text-sm text-oc-fg" key={message.id}>
															<Markdown text={message.text} />
															{appState.streaming && isLatestTurn && message.id === turn.steps.filter((s) => s.kind === "assistant").at(-1)?.id ? (
																<span className="inline-block w-1.5 h-1.5 rounded-full bg-oc-primary align-middle ml-1 animate-oc-pulse" />
															) : null}
														</div>
													);
												}
												if (message.kind === "thinking") {
													return null;
												}
												return (
													<div key={message.id}>
														{renderStep(message, expandedTools, setExpandedTools)}
													</div>
												);
											})}
										</div>
									);
								})}
							</>
						)}
					</div>
				) : (
					<div className="flex flex-col min-h-[300px]">
						<div className="px-4 py-2">
							<button className="inline-flex items-center gap-1 py-1 text-sm font-semibold text-oc-fg cursor-pointer [&_svg]:text-oc-fg-muted" type="button">
								Session changes
								<ChevronDown size={14} />
							</button>
						</div>
						<div className="flex-1 flex flex-col items-center justify-center text-center text-oc-fg-muted text-sm p-8">
							<div className="mb-3 flex justify-center">
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
			<footer className="shrink-0 px-3 pt-2 pb-2.5 bg-oc-bg">
				<div className="border border-oc-border rounded-oc bg-oc-card overflow-hidden relative">
					<input
						accept="image/*"
						className="hidden"
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
						<div className="flex flex-wrap gap-2 px-4 pt-3">
							{pendingImages.map((image, index) => (
								<div className="relative w-12 h-12 overflow-hidden rounded-md border border-oc-border" key={`${index.toString()}-${image.mimeType}`}>
									<img
										alt="pending"
										src={`data:${image.mimeType};base64,${image.data}`}
										className="w-full h-full object-cover"
									/>
									<button
										className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"
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
						className="block w-full min-h-[44px] max-h-[200px] pt-3 px-4 pb-1 bg-transparent outline-none resize-none text-[15px] leading-normal text-oc-fg placeholder:text-oc-fg-faint disabled:opacity-50 disabled:cursor-not-allowed"
						disabled={appState.streaming || !appState.connected}
						onChange={(event) => setPrompt(event.currentTarget.value)}
						onKeyDown={onPromptKeyDown}
						placeholder={hasContent ? "Ask anything..." : 'Ask anything... "Help me write a migration script"'}
						ref={promptRef}
						rows={1}
						value={prompt}
					/>

					{appState.streaming ? (
						<div className="absolute top-2 right-2 z-[1]">
							<button
								className="inline-flex items-center gap-1.5 py-1.5 px-3 border border-oc-border rounded-lg bg-oc-card text-[13px] font-medium text-oc-fg cursor-pointer"
								onClick={() => void abortPrompt()}
								type="button"
							>
								Stop
								<span className="text-[11px] py-px px-[5px] bg-oc-muted-bg rounded text-oc-fg-muted font-semibold">ESC</span>
							</button>
						</div>
					) : null}

					<div className="flex items-center justify-end px-2 pt-1 pb-2 gap-1">
						<div className="flex items-center gap-1">
							<button
								className={ICON_BTN}
								disabled={appState.streaming || !appState.connected}
								onClick={onAttachImage}
								type="button"
								aria-label="Attach image"
							>
								<Plus size={18} />
							</button>
							{appState.streaming ? (
								<button
									className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-lg bg-oc-primary text-white cursor-pointer shrink-0"
									onClick={() => void abortPrompt()}
									type="button"
								>
									<Square size={14} />
								</button>
							) : (
								<button
									className={cn(
										"inline-flex items-center justify-center w-[34px] h-[34px] rounded-lg text-white cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-default",
										prompt.trim() || pendingImages.length > 0 ? "bg-oc-primary" : "bg-oc-fg-faint",
									)}
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
				<div className="flex items-center gap-0 py-1.5 px-2 mt-1.5 border border-oc-border rounded-oc bg-oc-card">
					<button className={TOOLBAR_ITEM} type="button">
						Build
						<ChevronDown size={12} />
					</button>
					<button className={TOOLBAR_ITEM} type="button">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M12 2L2 7l10 5 10-5-10-5z" />
							<path d="M2 17l10 5 10-5" />
							<path d="M2 12l10 5 10-5" />
						</svg>
						Big Pickle
						<ChevronDown size={12} />
					</button>
					<button className={TOOLBAR_ITEM} type="button">
						Default
						<ChevronDown size={12} />
					</button>
					<div className="flex-1" />
					<button className={cn(ICON_BTN, "w-7 h-7")} type="button">
						<Terminal size={16} />
					</button>
					<button className={cn(ICON_BTN, "w-7 h-7")} type="button">
						<Monitor size={16} />
					</button>
				</div>
			</footer>
		</div>
	);
}

function EmptyState({ cwd }: { cwd?: string }) {
	return (
		<div className="flex-1 flex flex-col justify-end px-5 pt-6 pb-8">
			<h2 className="text-2xl font-light text-oc-fg-faint mb-5">New session</h2>
			<div className="flex flex-col gap-2.5">
				<div className="flex items-center gap-3 text-sm text-oc-fg-muted [&_svg]:text-oc-fg-faint [&_svg]:shrink-0 [&_strong]:text-oc-fg [&_strong]:font-semibold">
					<Folder size={16} />
					<span className="truncate">
						{cwd ? (
							<>
								{cwd.replace(/\/[^/]+$/, "/")}<strong>{cwd.split("/").pop()}</strong>
							</>
						) : (
							<>~/workspace/<strong>project</strong></>
						)}
					</span>
				</div>
				<div className="flex items-center gap-3 text-sm text-oc-fg-muted [&_svg]:text-oc-fg-faint [&_svg]:shrink-0 [&_strong]:text-oc-fg [&_strong]:font-semibold">
					<GitBranch size={16} />
					<span>Main branch (dev)</span>
				</div>
				<div className="flex items-center gap-3 text-sm text-oc-fg-muted [&_svg]:text-oc-fg-faint [&_svg]:shrink-0 [&_strong]:text-oc-fg [&_strong]:font-semibold">
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
			return null;
		case "tool":
			return message.toolStep ? (
				<ToolStep step={message.toolStep} messageId={message.id} expandedTools={expandedTools} setExpandedTools={setExpandedTools} />
			) : (
				<p className="text-[13px]">{message.text}</p>
			);
		case "error":
			return <p className="text-[13px] text-oc-error">{message.text}</p>;
		case "system":
			return <p className="text-xs text-oc-fg-muted">{message.text}</p>;
		case "assistant":
			return <Markdown text={message.text} />;
		default:
			return <p className="text-[13px]">{message.text}</p>;
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
		<div className="flex flex-col">
			<button
				className="flex items-center gap-2 text-left text-sm text-oc-fg-muted cursor-pointer hover:text-oc-fg"
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
				<span className="font-semibold text-oc-fg shrink-0">{toolLabel}</span>
				<span className="truncate min-w-0">{toolDescription}</span>
				{step.phase === "running" ? (
					<LoaderCircle size={14} className="animate-spin shrink-0" />
				) : null}
				{isExpanded ? (
					<ChevronDown size={14} className="text-oc-fg-faint shrink-0 transition-transform duration-150" />
				) : null}
			</button>
			{isExpanded ? (
				<div className="mt-2">
					<pre className="block px-4 py-3 border border-oc-border rounded-oc bg-oc-card font-mono text-[13px] leading-normal overflow-x-auto whitespace-pre-wrap break-all m-0 text-oc-fg">
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
