import { css, cx } from "@linaria/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomToolbar, type InputMode } from "./components/BottomToolbar.js";
import { Header } from "./components/Header.js";
import { MessageList } from "./components/MessageList.js";
import { PromptInput } from "./components/PromptInput.js";
import { ScheduledMessages } from "./components/ScheduledMessages.js";
import { SessionTitleBar } from "./components/SessionTitleBar.js";
import { Sidebar } from "./components/Sidebar.js";
import { createScenarioTransport } from "./mock/create-scenario-transport.js";
import { SCENARIOS } from "./mock/scenarios.js";
import { ProtocolClient } from "./protocol/client.js";
import type { ExtensionUiRequestEvent, ImageContent, ServerEvent, SessionSummary, ThinkingLevel } from "./protocol/types.js";
import { AppStore, type AppState } from "./state/store.js";
import type { Transport } from "./transport/transport.js";
import { WsClient } from "./transport/ws-client.js";
import { globalStyles } from "./styles/globalStyles.js";
import { deriveSessionTitle, error, getWebSocketUrl, groupTurns, lastUserMessage, log, warn } from "./utils/helpers.js";

const INITIAL_STATE: AppState = {
	connected: false,
	streaming: false,
	messages: [],
	scheduledMessages: [],
	sessions: [],
	currentSessionId: null,
	sidebarOpen: false,
	contextUsage: undefined,
	thinkingLevel: undefined,
};

const appRoot = css`
	display: flex;
	flex-direction: column;
	height: 100%;
	position: relative;
	overflow: hidden;
`;

const mainScroller = css`
	flex: 1 1 0%;
	min-height: 0;
	overflow-y: auto;
	padding-block-start: 12px;
`;

const footerStyle = css`
	flex-shrink: 0;
	padding: 8px 12px 10px;
	background-color: var(--color-oc-bg);
`;

export function App() {
	const [appState, setAppState] = useState<AppState>(INITIAL_STATE);
	const [prompt, setPrompt] = useState("");
	const [collapsedTurns, setCollapsedTurns] = useState<Set<string>>(new Set());
	const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
	const [pendingImages, setPendingImages] = useState<ImageContent[]>([]);
	const [inputMode, setInputMode] = useState<InputMode>("prompt");

	const scrollerRef = useRef<HTMLDivElement | null>(null);
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
			storeRef.current.setSessionState(sessionState.sessionId, sessions);
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
		async (mockAutoPrompt?: string, mockAutoSteeringPrompt?: string) => {
			const protocolClient = protocolRef.current;
			if (!protocolClient) return;

			try {
				const [sessionState, sessions] = await Promise.all([protocolClient.getState(), protocolClient.listSessions()]);
				storeRef.current.setSessions(sessions);
				if (sessionState.thinkingLevel) {
					storeRef.current.setThinkingLevel(sessionState.thinkingLevel);
				}

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
			if (mockAutoSteeringPrompt) {
				storeRef.current.addUserMessage(mockAutoSteeringPrompt, { scheduled: true });
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
		let mockAutoSteeringPrompt: string | undefined;

		let transport: Transport;
		if (mockParam !== null) {
			const scenarioName = mockParam || "default";
			const scenario = SCENARIOS[scenarioName] ?? SCENARIOS.default;
			log(`mock mode (scenario: ${scenarioName})`);
			const result = createScenarioTransport(scenario, { log });
			transport = result.transport;
			mockAutoPrompt = result.autoPrompt;
			mockAutoSteeringPrompt = result.autoSteeringPrompt;
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
				void onConnected(mockAutoPrompt, mockAutoSteeringPrompt);
				mockAutoPrompt = undefined;
				mockAutoSteeringPrompt = undefined;
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

	const sendBashCommand = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient || !appState.connected) return;

		let command = prompt.trim();
		if (!command) return;

		// Strip leading "!" (or "!!" for exclude-from-context, treat the same for now)
		if (command.startsWith("!!")) {
			command = command.slice(2).trim();
		} else if (command.startsWith("!")) {
			command = command.slice(1).trim();
		}
		if (!command) return;

		setPrompt("");
		setInputMode("prompt");

		try {
			const result = await protocolClient.bash(command);
			storeRef.current.addBashResultMessage(command, result.output, result.exitCode);
		} catch (bashError) {
			const messageText = bashError instanceof Error ? bashError.message : String(bashError);
			storeRef.current.addErrorMessage(`Bash error: ${messageText}`);
		}
	}, [appState.connected, prompt]);

	const sendPrompt = useCallback(async () => {
		if (inputMode === "shell") {
			return sendBashCommand();
		}

		const protocolClient = protocolRef.current;
		if (!protocolClient) return;

		const message = prompt.trim();

		// Auto-detect "!" prefix in prompt mode
		if (message.startsWith("!")) {
			return sendBashCommand();
		}

		const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
		if ((!message && !images) || !appState.connected) return;

		storeRef.current.addUserMessage(message || "(image attachment)", {
			images,
			scheduled: appState.streaming,
		});
		setPrompt("");
		setPendingImages([]);

		try {
			const response = await protocolClient.prompt(message, {
				images,
				streamingBehavior: appState.streaming ? "steer" : undefined,
			});
			if (!response.success) {
				storeRef.current.addErrorMessage(`Command error (${response.command}): ${response.error || "unknown error"}`);
			}
		} catch (sendError) {
			const messageText = sendError instanceof Error ? sendError.message : String(sendError);
			storeRef.current.addErrorMessage(`Failed to send prompt: ${messageText}`);
		}
	}, [appState.connected, appState.streaming, inputMode, pendingImages, prompt, sendBashCommand]);

	const dequeueScheduledMessages = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) return;

		const cleared = storeRef.current.clearScheduledMessages();
		if (cleared.length === 0) return;

		// Restore text into the prompt input
		const restoredText = cleared.map((m) => m.text).join("\n\n");
		setPrompt((current) => {
			const combined = [restoredText, current].filter((t) => t.trim()).join("\n\n");
			return combined;
		});

		try {
			await protocolClient.clearQueue();
		} catch (dequeueError) {
			const messageText = dequeueError instanceof Error ? dequeueError.message : String(dequeueError);
			storeRef.current.addErrorMessage(`Failed to dequeue messages: ${messageText}`);
		}
	}, []);

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

	const onThinkingLevelChange = useCallback(
		async (level: ThinkingLevel) => {
			const protocolClient = protocolRef.current;
			if (!protocolClient) return;

			// Optimistically update the UI
			storeRef.current.setThinkingLevel(level);

			try {
				await protocolClient.setThinkingLevel(level);
			} catch (err) {
				const messageText = err instanceof Error ? err.message : String(err);
				storeRef.current.addErrorMessage(`Failed to set thinking level: ${messageText}`);
			}
		},
		[],
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
		<div className={cx(globalStyles, appRoot)}>
			<Sidebar
				open={appState.sidebarOpen}
				sessions={appState.sessions}
				currentSessionId={appState.currentSessionId}
				currentCwd={currentSession?.cwd}
				onClose={() => storeRef.current.setSidebarOpen(false)}
				onNewSession={() => void onNewSession()}
				onSwitchSession={(session) => void onSwitchSession(session)}
			/>

			<Header
				connected={appState.connected}
				onOpenSidebar={() => storeRef.current.setSidebarOpen(true)}
			/>

			{hasContent && sessionTitle ? (
				<SessionTitleBar title={sessionTitle} />
			) : null}

			{/* Main content area */}
			<div className={mainScroller} ref={scrollerRef}>
				<MessageList
					orphans={orphans}
					turns={turns}
					latestUserId={latestUserId}
					streaming={appState.streaming}
					expandedTools={expandedTools}
					setExpandedTools={setExpandedTools}
					cwd={currentSession?.cwd}
				/>
			</div>

			<ScheduledMessages
				messages={appState.scheduledMessages}
				onDequeue={() => void dequeueScheduledMessages()}
			/>

			{/* Footer: prompt input + toolbar */}
			<footer className={footerStyle}>
				<PromptInput
					mode={inputMode}
					prompt={prompt}
					streaming={appState.streaming}
					connected={appState.connected}
					hasContent={hasContent}
					pendingImages={pendingImages}
					onPromptChange={setPrompt}
					onModeChange={setInputMode}
					onSend={() => void sendPrompt()}
					onAbort={() => void abortPrompt()}
					onAddImages={(images) => setPendingImages((current) => [...current, ...images])}
					onRemoveImage={(index) => setPendingImages((current) => current.filter((_, i) => i !== index))}
					onError={(message) => storeRef.current.addErrorMessage(message)}
				/>
				<BottomToolbar
					mode={inputMode}
					onModeChange={setInputMode}
					thinkingLevel={appState.thinkingLevel}
					onThinkingLevelChange={(level) => void onThinkingLevelChange(level)}
				/>
			</footer>
		</div>
	);
}
