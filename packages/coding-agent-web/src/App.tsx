import { Check, ChevronDown, ImagePlus, LoaderCircle, Menu, Plus, Square, X } from "lucide-react";
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
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Textarea } from "./components/ui/textarea.js";

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

export function App() {
	const [appState, setAppState] = useState<AppState>(INITIAL_STATE);
	const [prompt, setPrompt] = useState("");
	const [collapsedTurns, setCollapsedTurns] = useState<Set<string>>(new Set());
	const [pendingImages, setPendingImages] = useState<ImageContent[]>([]);

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

	return (
		<div className="relative flex h-full flex-col bg-background text-foreground">
			<div
				className={
					appState.sidebarOpen
						? "fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
						: "pointer-events-none fixed inset-0 z-40 bg-black/0"
				}
				onClick={() => storeRef.current.setSidebarOpen(false)}
			/>
			<aside
				className={
					appState.sidebarOpen
						? "fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] translate-x-0 flex-col border-r bg-card transition-transform"
						: "fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] -translate-x-full flex-col border-r bg-card transition-transform"
				}
			>
				<div className="border-b px-4 py-3">
					<p className="text-lg font-semibold">pi</p>
				</div>
				<div className="p-3">
					<Button className="w-full justify-start gap-2" variant="outline" onClick={() => void onNewSession()}>
						<Plus className="size-4" />
						New session
					</Button>
				</div>
				<div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
					{appState.sessions.length === 0 ? (
						<p className="px-3 py-2 text-sm text-muted-foreground">No sessions yet</p>
					) : null}
					{appState.sessions.map((session) => {
						const displayName = session.name ?? session.firstMessage;
						const truncated =
							displayName.length > 60 ? `${displayName.slice(0, 60)}...` : displayName;
						const active = session.id === appState.currentSessionId;
						return (
							<button
								className={
									active
										? "w-full rounded-md bg-muted px-3 py-2 text-left"
										: "w-full rounded-md px-3 py-2 text-left hover:bg-muted/70"
								}
								onClick={() => void onSwitchSession(session)}
								type="button"
								key={session.id}
							>
								<p className="truncate text-sm font-medium text-foreground">{truncated}</p>
								<p className="truncate text-xs text-muted-foreground">{shortenPath(session.cwd)}</p>
								<div className="mt-1 flex gap-2 text-xs text-muted-foreground">
									<span>{session.messageCount} messages</span>
									<span>{timeAgo(session.modified)}</span>
								</div>
							</button>
						);
					})}
				</div>
			</aside>

			<header className="flex h-11 items-center justify-between border-b bg-card px-4">
				<div className="flex items-center gap-2">
					<Button
						aria-label="Open sidebar"
						onClick={() => storeRef.current.setSidebarOpen(true)}
						size="icon"
						variant="outline"
					>
						<Menu className="size-4" />
					</Button>
					<h1 className="text-lg font-semibold">pi</h1>
				</div>
				<Badge variant="outline" className="gap-2 rounded-full px-3 py-1 text-xs font-medium">
					<span
						className={
							appState.connected ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-destructive"
						}
					/>
					Status
				</Badge>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto" ref={scrollerRef}>
				<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
					{!hasContent ? (
						<div className="flex flex-col items-center gap-4 py-20 text-center">
							<p className="text-5xl font-bold tracking-tight text-muted-foreground/40">pi</p>
							<p className="text-sm text-muted-foreground">Send a message to get started</p>
						</div>
					) : null}

					{orphans.map((message) => (
						<div className="text-sm text-muted-foreground" key={message.id}>
							{renderStep(message)}
						</div>
					))}

					{turns.map((turn) => {
						const toolSteps = turn.steps.filter((step) => step.kind === "tool" || step.kind === "thinking");
						const assistantSteps = turn.steps.filter((step) => step.kind === "assistant");
						const errorSteps = turn.steps.filter((step) => step.kind === "error");
						const systemSteps = turn.steps.filter((step) => step.kind === "system");
						const isCollapsed = collapsedTurns.has(turn.user.id);
						const isLatestTurn = turn.user.id === latestUserId;

						return (
							<section className="flex flex-col gap-4" key={turn.user.id}>
								<div className="rounded-lg bg-muted px-4 py-3 text-sm whitespace-pre-wrap text-foreground">
									{turn.user.text}
									{turn.user.images && turn.user.images.length > 0 ? (
										<div className="mt-2 flex flex-wrap gap-2">
											{turn.user.images.map((image, index) => (
												<div className="size-20 overflow-hidden rounded-md border" key={`${turn.user.id}-${index.toString()}`}>
													<img
														alt="attached image"
														className="h-full w-full object-cover"
														src={`data:${image.mimeType};base64,${image.data}`}
													/>
												</div>
											))}
										</div>
									) : null}
								</div>

								{toolSteps.length > 0 ? (
									<>
										<Button
											className="h-auto w-fit gap-2 px-0 text-sm text-muted-foreground hover:text-foreground"
											onClick={() => {
												setCollapsedTurns((current) => {
													const next = new Set(current);
													if (next.has(turn.user.id)) {
														next.delete(turn.user.id);
													} else {
														next.add(turn.user.id);
													}
													return next;
												});
											}}
											size="sm"
											type="button"
											variant="ghost"
										>
											<ChevronDown
												className={isCollapsed ? "size-4 -rotate-90 transition-transform" : "size-4 transition-transform"}
											/>
											{toolSteps.length} step{toolSteps.length > 1 ? "s" : ""}
										</Button>
										{!isCollapsed ? (
											<div className="ml-3 space-y-3 border-l pl-3">
												{toolSteps.map((message) => (
													<div key={message.id}>{renderStep(message)}</div>
												))}
											</div>
										) : null}
									</>
								) : null}

								{errorSteps.map((message) => (
									<div key={message.id}>{renderStep(message)}</div>
								))}

								{assistantSteps.map((message) => (
									<div className="text-sm text-foreground" key={message.id}>
										<Markdown text={message.text} />
										{appState.streaming && isLatestTurn ? (
											<span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />
										) : null}
									</div>
								))}

								{appState.streaming && isLatestTurn && assistantSteps.length === 0 && errorSteps.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Thinking
										<span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />
									</p>
								) : null}

								{systemSteps.map((message) => (
									<div key={message.id}>{renderStep(message)}</div>
								))}
							</section>
						);
					})}
				</div>
			</div>

			<footer className="sticky bottom-0 bg-background/95 px-4 pb-4 pt-2 backdrop-blur sm:px-6">
				<div className="mx-auto w-full max-w-4xl rounded-xl border bg-card shadow-sm">
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
						<div className="flex flex-wrap gap-2 px-3 pt-3">
							{pendingImages.map((image, index) => (
								<div className="relative size-14 overflow-hidden rounded-md border" key={`${index.toString()}-${image.mimeType}`}>
									<img
										alt="pending attachment"
										className="h-full w-full object-cover"
										src={`data:${image.mimeType};base64,${image.data}`}
									/>
									<Button
										className="absolute right-1 top-1 size-5 rounded-full bg-black/60 p-0 text-white hover:bg-black/80"
										onClick={() => {
											setPendingImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
										}}
										size="icon"
										type="button"
										variant="ghost"
									>
										<X className="size-3" />
									</Button>
								</div>
							))}
						</div>
					) : null}

					<Textarea
						className="max-h-[200px] min-h-11 resize-none border-0 bg-transparent px-4 pt-3 shadow-none focus-visible:ring-0"
						disabled={appState.streaming || !appState.connected}
						id="prompt"
						name="prompt"
						onChange={(event) => {
							setPrompt(event.currentTarget.value);
						}}
						onKeyDown={onPromptKeyDown}
						placeholder="Ask anything..."
						ref={promptRef}
						rows={1}
						value={prompt}
					/>

					<div className="flex items-center justify-between px-3 pb-3">
						<div />
						<div className="flex items-center gap-2">
							<ContextRing usage={appState.contextUsage} />
							<Button
								aria-label="Attach image"
								disabled={appState.streaming || !appState.connected}
								onClick={onAttachImage}
								size="icon"
								title="Attach image"
								variant="ghost"
							>
								<ImagePlus className="size-4" />
							</Button>
							{appState.streaming ? (
								<Button onClick={() => void abortPrompt()} size="sm" variant="outline">
									<Square className="mr-2 size-3.5" />
									Stop
								</Button>
							) : (
								<Button
									aria-label="Send prompt"
									disabled={!appState.connected || (!prompt.trim() && pendingImages.length === 0)}
									onClick={() => {
										void sendPrompt();
									}}
									size="icon"
									title="Send"
								>
									<ChevronDown className="size-4 rotate-180" />
								</Button>
							)}
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}

function renderStep(message: UiMessage) {
	switch (message.kind) {
		case "thinking":
			return <p className="text-sm italic text-muted-foreground">{message.text}</p>;
		case "tool":
			return message.toolStep ? <ToolStep step={message.toolStep} /> : <p className="text-sm">{message.text}</p>;
		case "error":
			return <p className="text-sm text-destructive">{message.text}</p>;
		case "system":
			return <p className="text-xs text-muted-foreground">{message.text}</p>;
		case "assistant":
			return <Markdown text={message.text} />;
		default:
			return <p className="text-sm">{message.text}</p>;
	}
}

function ToolStep({ step }: { step: ToolStepData }) {
	return (
		<div className="space-y-1 text-sm">
			<div className="flex flex-wrap items-center gap-2 font-mono text-xs">
				<span className="font-medium text-amber-600">{step.toolName}</span>
				<span className="break-all text-muted-foreground">{step.toolArgs}</span>
			</div>
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">{renderToolStatus(step.phase)}</div>
			{step.result ? (
				<div
					className={
						step.phase === "error"
							? "max-h-20 overflow-hidden break-all font-mono text-xs text-destructive"
							: "max-h-20 overflow-hidden break-all font-mono text-xs text-muted-foreground"
					}
				>
					{step.result}
				</div>
			) : null}
		</div>
	);
}

function renderToolStatus(phase: ToolStepData["phase"]) {
	switch (phase) {
		case "calling":
			return (
				<>
					<span className="text-[10px]">···</span>
					<span>Calling...</span>
				</>
			);
		case "running":
			return (
				<>
					<LoaderCircle className="size-3.5 animate-spin text-primary" />
					<span>Running...</span>
				</>
			);
		case "done":
			return (
				<>
					<Check className="size-3.5 text-emerald-500" />
					<span>Done</span>
				</>
			);
		case "error":
			return (
				<>
					<X className="size-3.5 text-destructive" />
					<span>Error</span>
				</>
			);
	}
}

function ContextRing({ usage }: { usage: AppState["contextUsage"] }) {
	if (!usage) return null;

	const percent = Math.round(Math.min(100, Math.max(0, usage.percent)));
	const radius = 8;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (percent / 100) * circumference;

	let strokeColor = "hsl(var(--muted-foreground))";
	if (percent >= 80) {
		strokeColor = "hsl(var(--destructive))";
	} else if (percent >= 50) {
		strokeColor = "#f59e0b";
	}

	const tokensK = Math.round(usage.tokens / 1000);
	const windowK = Math.round(usage.contextWindow / 1000);
	const tooltip = `${tokensK}k / ${windowK}k tokens (${percent}%)`;

	return (
		<div className="group relative inline-flex size-8 items-center justify-center">
			<svg className="size-5 -rotate-90" viewBox="0 0 20 20">
				<circle className="stroke-border" cx="10" cy="10" fill="none" r={radius} strokeWidth="2" />
				<circle
					cx="10"
					cy="10"
					fill="none"
					r={radius}
					stroke={strokeColor}
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					strokeWidth="2"
				/>
			</svg>
			<span className="pointer-events-none absolute -top-8 right-0 hidden rounded bg-foreground px-2 py-1 text-[11px] font-medium whitespace-nowrap text-background group-hover:block">
				{tooltip}
			</span>
		</div>
	);
}
