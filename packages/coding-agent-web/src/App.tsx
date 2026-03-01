import { css, cx } from "@linaria/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BottomToolbar } from "./components/BottomToolbar.js";
import { DirectoryPicker } from "./components/DirectoryPicker.js";
import { Header } from "./components/Header.js";
import { MessageList } from "./components/MessageList.js";
import { PromptInput } from "./components/PromptInput.js";
import { ScheduledMessages } from "./components/ScheduledMessages.js";
import { SessionTitleBar } from "./components/SessionTitleBar.js";
import { Sidebar } from "./components/Sidebar.js";
import { createScenarioTransport } from "./mock/create-scenario-transport.js";
import { SCENARIOS } from "./mock/scenarios.js";
import { ProtocolClient } from "./protocol/client.js";
import type { ContextUsage, ExtensionUiRequestEvent, MessageStartEvent, SessionSummary, ThinkingLevel } from "./protocol/types.js";
import { MessageController, type UiMessage, useAppStore } from "./state/store.js";
import { globalStyles } from "./styles/globalStyles.js";
import type { Transport } from "./transport/transport.js";
import { WsClient } from "./transport/ws-client.js";
import {
	deriveSessionTitle,
	error,
	getSessionFromUrl,
	getWebSocketUrl,
	groupTurns,
	lastUserMessage,
	log,
	setSessionInUrl,
	warn,
} from "./utils/helpers.js";

const SESSION_STATE_QUERY_KEY = ["session-state"] as const;
const SESSIONS_QUERY_KEY = ["sessions"] as const;
const DISABLED_UI_MESSAGES_QUERY_KEY = ["ui-messages", "disabled"] as const;
const DISABLED_CONTEXT_USAGE_QUERY_KEY = ["context-usage", "disabled"] as const;

const uiMessagesQueryKey = (sessionId: string) => ["ui-messages", sessionId] as const;
const contextUsageQueryKey = (sessionId: string) => ["context-usage", sessionId] as const;

type SessionState = Awaited<ReturnType<ProtocolClient["getState"]>>;

function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
	return [...sessions].sort((left, right) => new Date(right.modified).getTime() - new Date(left.modified).getTime());
}

function extractUserTextFromMessageStart(message: MessageStartEvent["message"]): string | undefined {
	if (message.role !== "user") {
		return undefined;
	}
	const content = message.content;
	return typeof content === "string" ? content : content.map((part) => ("text" in part ? part.text : "")).join("");
}

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
	const queryClient = useQueryClient();
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const transportRef = useRef<Transport | undefined>(undefined);
	const protocolRef = useRef<ProtocolClient | undefined>(undefined);
	const messageControllerRef = useRef(new MessageController());
	const activeSessionIdRef = useRef<string | null>(null);
	const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);

	const {
		connected,
		streaming,
		scheduledMessages,
		sidebarOpen,
		prompt,
		inputMode,
		pendingImages,
		expandedTools,
		setConnected,
		setStreaming,
		setSidebarOpen,
		setPrompt,
		setInputMode,
		addPendingImages,
		removePendingImage,
		clearPendingImages,
		clearExpandedTools,
		setExpandedTools,
		addScheduledMessage,
		clearScheduledMessages,
		consumeScheduledMessage,
	} = useAppStore(
		useShallow((state) => ({
			connected: state.connected,
			streaming: state.streaming,
			scheduledMessages: state.scheduledMessages,
			sidebarOpen: state.sidebarOpen,
			prompt: state.prompt,
			inputMode: state.inputMode,
			pendingImages: state.pendingImages,
			expandedTools: state.expandedTools,
			setConnected: state.setConnected,
			setStreaming: state.setStreaming,
			setSidebarOpen: state.setSidebarOpen,
			setPrompt: state.setPrompt,
			setInputMode: state.setInputMode,
			addPendingImages: state.addPendingImages,
			removePendingImage: state.removePendingImage,
			clearPendingImages: state.clearPendingImages,
			clearExpandedTools: state.clearExpandedTools,
			setExpandedTools: state.setExpandedTools,
			addScheduledMessage: state.addScheduledMessage,
			clearScheduledMessages: state.clearScheduledMessages,
			consumeScheduledMessage: state.consumeScheduledMessage,
		})),
	);

	const getProtocolClient = useCallback((): ProtocolClient => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) {
			throw new Error("Protocol client is not initialized");
		}
		return protocolClient;
	}, []);

	const sessionStateQuery = useQuery({
		queryKey: SESSION_STATE_QUERY_KEY,
		enabled: connected,
		queryFn: () => getProtocolClient().getState(),
	});

	const sessionsQuery = useQuery({
		queryKey: SESSIONS_QUERY_KEY,
		enabled: connected,
		queryFn: () => getProtocolClient().listSessions(),
	});

	const currentSessionId = sessionStateQuery.data?.sessionId ?? null;
	const messagesQueryKey = currentSessionId ? uiMessagesQueryKey(currentSessionId) : DISABLED_UI_MESSAGES_QUERY_KEY;
	const contextQueryKey = currentSessionId ? contextUsageQueryKey(currentSessionId) : DISABLED_CONTEXT_USAGE_QUERY_KEY;

	const messagesQuery = useQuery<UiMessage[]>({
		queryKey: messagesQueryKey,
		enabled: connected && currentSessionId !== null,
		queryFn: async () => {
			const history = await getProtocolClient().getMessages();
			return messageControllerRef.current.loadMessagesFromHistory(history);
		},
	});

	const contextUsageQuery = useQuery<ContextUsage | undefined>({
		queryKey: contextQueryKey,
		enabled: connected && currentSessionId !== null,
		queryFn: () => getProtocolClient().getContextUsage(),
	});

	const appendMessage = useCallback(
		(sessionId: string | null, message: UiMessage): void => {
			if (!sessionId) {
				return;
			}
			queryClient.setQueryData<UiMessage[]>(uiMessagesQueryKey(sessionId), (current) => [...(current ?? []), message]);
		},
		[queryClient],
	);

	const appendErrorMessage = useCallback(
		(text: string): void => {
			const message = messageControllerRef.current.createErrorMessage(text);
			appendMessage(activeSessionIdRef.current, message);
		},
		[appendMessage],
	);

	const appendBashResultMessage = useCallback(
		(command: string, output: string, exitCode: number | undefined): void => {
			const message = messageControllerRef.current.createBashResultMessage(command, output, exitCode);
			appendMessage(activeSessionIdRef.current, message);
		},
		[appendMessage],
	);

	const invalidateSessionQueries = useCallback(async (): Promise<void> => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: SESSION_STATE_QUERY_KEY }),
			queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY }),
			queryClient.invalidateQueries({ queryKey: ["ui-messages"] }),
			queryClient.invalidateQueries({ queryKey: ["context-usage"] }),
		]);
	}, [queryClient]);

	const resetSessionUiState = useCallback((): void => {
		messageControllerRef.current.resetActiveMessageIds();
		clearExpandedTools();
		setPrompt("");
		clearPendingImages();
		setInputMode("prompt");
	}, [clearExpandedTools, clearPendingImages, setInputMode, setPrompt]);

	const handleExtensionUiRequest = useCallback((event: ExtensionUiRequestEvent) => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) {
			return;
		}

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
			if (!protocolClient) {
				return;
			}

			try {
				const [initialSessionState, sessions] = await Promise.all([
					queryClient.fetchQuery({
						queryKey: SESSION_STATE_QUERY_KEY,
						queryFn: () => protocolClient.getState(),
					}),
					queryClient.fetchQuery({
						queryKey: SESSIONS_QUERY_KEY,
						queryFn: () => protocolClient.listSessions(),
					}),
				]);
				let sessionState = initialSessionState;

				const sortedSessions = sortSessions(sessions);
				const urlSessionId = getSessionFromUrl();
				const urlSession = urlSessionId ? sortedSessions.find((session) => session.id === urlSessionId) : undefined;
				const fallbackSession = urlSession ? undefined : sortedSessions[0];
				const targetSession = urlSession ?? fallbackSession;

				if (targetSession && targetSession.id !== sessionState.sessionId) {
					if (urlSession) {
						log("restoring session from URL:", targetSession.id, targetSession.name ?? targetSession.firstMessage);
					} else {
						log("resuming last session:", targetSession.id, targetSession.name ?? targetSession.firstMessage);
					}
					await protocolClient.switchSession(targetSession.path);
					await invalidateSessionQueries();
					sessionState = await queryClient.fetchQuery({
						queryKey: SESSION_STATE_QUERY_KEY,
						queryFn: () => protocolClient.getState(),
					});
				}

				activeSessionIdRef.current = sessionState.sessionId;
				if (mockAutoPrompt) {
					appendMessage(sessionState.sessionId, messageControllerRef.current.createUserMessage(mockAutoPrompt));
				}
				if (mockAutoSteeringPrompt) {
					addScheduledMessage(messageControllerRef.current.createUserMessage(mockAutoSteeringPrompt));
				}
			} catch (loadError) {
				log("failed to load session state:", loadError);
			}
		},
		[addScheduledMessage, appendMessage, invalidateSessionQueries, queryClient],
	);

	useEffect(() => {
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

		const unsubscribeEvent = transport.onEvent((event) => {
			if (event.type === "agent_start") {
				setStreaming(true);
			}
			if (event.type === "agent_end") {
				setStreaming(false);
			}

			const sessionId = activeSessionIdRef.current;
			if (event.type === "message_start") {
				const text = extractUserTextFromMessageStart(event.message);
				if (text) {
					const scheduledMessage = consumeScheduledMessage(text);
					if (scheduledMessage) {
						appendMessage(sessionId, scheduledMessage);
					}
				}
			}

			if (sessionId) {
				queryClient.setQueryData<UiMessage[]>(uiMessagesQueryKey(sessionId), (current) =>
					messageControllerRef.current.handleServerEvent(current ?? [], event),
				);
			}

			if (event.type === "extension_ui_request") {
				handleExtensionUiRequest(event);
			}
			if (event.type === "session_changed") {
				activeSessionIdRef.current = event.sessionId;
				messageControllerRef.current.resetActiveMessageIds();
				queryClient.setQueryData<SessionState>(SESSION_STATE_QUERY_KEY, (current) => ({
					sessionId: event.sessionId,
					sessionName: event.sessionName ?? current?.sessionName,
					thinkingLevel: current?.thinkingLevel,
				}));
				void invalidateSessionQueries();
				void queryClient.fetchQuery({
					queryKey: uiMessagesQueryKey(event.sessionId),
					queryFn: async () => {
						const history = await getProtocolClient().getMessages();
						return messageControllerRef.current.loadMessagesFromHistory(history);
					},
				});
				void queryClient.fetchQuery({
					queryKey: contextUsageQueryKey(event.sessionId),
					queryFn: () => getProtocolClient().getContextUsage(),
				});
			}
			if (event.type === "agent_end") {
				if (activeSessionIdRef.current) {
					void queryClient.invalidateQueries({ queryKey: contextUsageQueryKey(activeSessionIdRef.current) });
				} else {
					void queryClient.invalidateQueries({ queryKey: ["context-usage"] });
				}
			}
		});

		const unsubscribeStatus = transport.onStatus((isConnected) => {
			setConnected(isConnected);
			if (!isConnected) {
				setStreaming(false);
				activeSessionIdRef.current = null;
				return;
			}
			void onConnected(mockAutoPrompt, mockAutoSteeringPrompt);
			mockAutoPrompt = undefined;
			mockAutoSteeringPrompt = undefined;
		});

		transport.connect();
		log("client initialized");

		return () => {
			unsubscribeEvent();
			unsubscribeStatus();
			transport.disconnect();
			transportRef.current = undefined;
			protocolRef.current = undefined;
		};
	}, [
		appendMessage,
		consumeScheduledMessage,
		getProtocolClient,
		handleExtensionUiRequest,
		invalidateSessionQueries,
		onConnected,
		queryClient,
		setConnected,
		setStreaming,
	]);

	useEffect(() => {
		activeSessionIdRef.current = currentSessionId;
	}, [currentSessionId]);

	// Sync current session ID to URL so reloading the tab restores the session.
	// Skip null (initial "not yet determined" state) to avoid wiping the URL
	// param before onConnected has a chance to read it.
	useEffect(() => {
		if (currentSessionId !== null) {
			setSessionInUrl(currentSessionId);
		}
	}, [currentSessionId]);

	const messages = messagesQuery.data ?? [];

	useEffect(() => {
		if (scrollerRef.current) {
			scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
		}
	}, [messages, streaming]);

	const sendBashCommand = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient || !connected) {
			return;
		}

		let command = prompt.trim();
		if (!command) {
			return;
		}

		if (command.startsWith("!!")) {
			command = command.slice(2).trim();
		} else if (command.startsWith("!")) {
			command = command.slice(1).trim();
		}
		if (!command) {
			return;
		}

		setPrompt("");
		setInputMode("prompt");

		try {
			const result = await protocolClient.bash(command);
			appendBashResultMessage(command, result.output, result.exitCode);
		} catch (bashError) {
			const messageText = bashError instanceof Error ? bashError.message : String(bashError);
			appendErrorMessage(`Bash error: ${messageText}`);
		}
	}, [appendBashResultMessage, appendErrorMessage, connected, prompt, setInputMode, setPrompt]);

	const sendPrompt = useCallback(async () => {
		if (inputMode === "shell") {
			return sendBashCommand();
		}

		const protocolClient = protocolRef.current;
		if (!protocolClient) {
			return;
		}

		const message = prompt.trim();
		if (message.startsWith("!")) {
			return sendBashCommand();
		}

		const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
		if ((!message && !images) || !connected) {
			return;
		}

		const userMessage = messageControllerRef.current.createUserMessage(message || "(image attachment)", { images });
		const targetSessionId = activeSessionIdRef.current ?? currentSessionId;
		if (streaming) {
			addScheduledMessage(userMessage);
		} else {
			appendMessage(targetSessionId, userMessage);
		}
		setPrompt("");
		clearPendingImages();

		try {
			const response = await protocolClient.prompt(message, {
				images,
				streamingBehavior: streaming ? "steer" : undefined,
			});
			if (!response.success) {
				appendErrorMessage(`Command error (${response.command}): ${response.error || "unknown error"}`);
			}
		} catch (sendError) {
			const messageText = sendError instanceof Error ? sendError.message : String(sendError);
			appendErrorMessage(`Failed to send prompt: ${messageText}`);
		}
	}, [
		addScheduledMessage,
		appendErrorMessage,
		appendMessage,
		clearPendingImages,
		connected,
		currentSessionId,
		inputMode,
		pendingImages,
		prompt,
		sendBashCommand,
		setPrompt,
		streaming,
	]);

	const dequeueScheduledMessages = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) {
			return;
		}

		const cleared = clearScheduledMessages();
		if (cleared.length === 0) {
			return;
		}

		const restoredText = cleared.map((message) => message.text).join("\n\n");
		setPrompt((current) => [restoredText, current].filter((text) => text.trim()).join("\n\n"));

		try {
			await protocolClient.clearQueue();
		} catch (dequeueError) {
			const messageText = dequeueError instanceof Error ? dequeueError.message : String(dequeueError);
			appendErrorMessage(`Failed to dequeue messages: ${messageText}`);
		}
	}, [appendErrorMessage, clearScheduledMessages, setPrompt]);

	const abortPrompt = useCallback(async () => {
		const protocolClient = protocolRef.current;
		if (!protocolClient || !connected) {
			return;
		}

		try {
			await protocolClient.abort();
		} catch (abortError) {
			const messageText = abortError instanceof Error ? abortError.message : String(abortError);
			appendErrorMessage(`Failed to abort: ${messageText}`);
		}
	}, [appendErrorMessage, connected]);

	const onNewSession = useCallback(() => {
		setSidebarOpen(false);
		setDirectoryPickerOpen(true);
	}, [setSidebarOpen]);

	const onNewSessionConfirm = useCallback(async (cwd: string) => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) {
			return;
		}

		setDirectoryPickerOpen(false);
		try {
			await protocolClient.newSession(cwd);
			resetSessionUiState();
			await invalidateSessionQueries();
		} catch (sessionError) {
			const messageText = sessionError instanceof Error ? sessionError.message : String(sessionError);
			appendErrorMessage(`Failed to create session: ${messageText}`);
		}
	}, [appendErrorMessage, invalidateSessionQueries, resetSessionUiState]);

	const listDirectory = useCallback(async (path: string) => {
		const protocolClient = protocolRef.current;
		if (!protocolClient) {
			throw new Error("Not connected");
		}
		return protocolClient.listDirectory(path);
	}, []);

	const sessions = useMemo(() => sortSessions(sessionsQuery.data ?? []), [sessionsQuery.data]);

	const onSwitchSession = useCallback(
		async (session: SessionSummary) => {
			const protocolClient = protocolRef.current;
			if (!protocolClient) {
				return;
			}

			if (session.id === currentSessionId) {
				setSidebarOpen(false);
				return;
			}

			setSidebarOpen(false);
			try {
				await protocolClient.switchSession(session.path);
				resetSessionUiState();
				await invalidateSessionQueries();
			} catch (switchError) {
				const messageText = switchError instanceof Error ? switchError.message : String(switchError);
				appendErrorMessage(`Failed to switch session: ${messageText}`);
			}
		},
		[appendErrorMessage, currentSessionId, invalidateSessionQueries, resetSessionUiState, setSidebarOpen],
	);

	const onThinkingLevelChange = useCallback(
		async (level: ThinkingLevel) => {
			const protocolClient = protocolRef.current;
			if (!protocolClient) {
				return;
			}

			const previous = queryClient.getQueryData<SessionState>(SESSION_STATE_QUERY_KEY);
			if (previous) {
				queryClient.setQueryData<SessionState>(SESSION_STATE_QUERY_KEY, {
					...previous,
					thinkingLevel: level,
				});
			}

			try {
				await protocolClient.setThinkingLevel(level);
			} catch (setLevelError) {
				if (previous) {
					queryClient.setQueryData(SESSION_STATE_QUERY_KEY, previous);
				}
				const messageText = setLevelError instanceof Error ? setLevelError.message : String(setLevelError);
				appendErrorMessage(`Failed to set thinking level: ${messageText}`);
			}
		},
		[appendErrorMessage, queryClient],
	);

	const { orphans, turns } = useMemo(() => groupTurns(messages), [messages]);
	const hasContent = orphans.length > 0 || turns.length > 0;
	const latestUserId = useMemo(() => lastUserMessage(messages)?.id, [messages]);
	const sessionTitle = useMemo(() => deriveSessionTitle(messages), [messages]);

	const currentSession = useMemo(() => {
		if (!currentSessionId) {
			return undefined;
		}
		return sessions.find((session) => session.id === currentSessionId);
	}, [currentSessionId, sessions]);

	const thinkingLevel = sessionStateQuery.data?.thinkingLevel;

	return (
		<div className={cx(globalStyles, appRoot)}>
			<Sidebar
				open={sidebarOpen}
				sessions={sessions}
				currentSessionId={currentSessionId}
				currentCwd={currentSession?.cwd}
				onClose={() => setSidebarOpen(false)}
				onNewSession={onNewSession}
				onSwitchSession={(session) => {
					void onSwitchSession(session);
				}}
			/>

			<Header
				connected={connected}
				onOpenSidebar={() => setSidebarOpen(true)}
			/>

			{hasContent && sessionTitle ? (
				<SessionTitleBar
					title={sessionTitle}
					contextUsage={contextUsageQuery.data ?? undefined}
					streaming={streaming}
				/>
			) : null}

			<div className={mainScroller} ref={scrollerRef}>
				<MessageList
					orphans={orphans}
					turns={turns}
					latestUserId={latestUserId}
					streaming={streaming}
					expandedTools={expandedTools}
					setExpandedTools={setExpandedTools}
					cwd={currentSession?.cwd}
				/>
			</div>

			<ScheduledMessages
				messages={scheduledMessages}
				onDequeue={() => {
					void dequeueScheduledMessages();
				}}
			/>

			<footer className={footerStyle}>
				<PromptInput
					mode={inputMode}
					prompt={prompt}
					streaming={streaming}
					connected={connected}
					hasContent={hasContent}
					pendingImages={pendingImages}
					onPromptChange={setPrompt}
					onModeChange={setInputMode}
					onSend={() => {
						void sendPrompt();
					}}
					onAbort={() => {
						void abortPrompt();
					}}
					onAddImages={addPendingImages}
					onRemoveImage={removePendingImage}
					onError={appendErrorMessage}
				/>
				<BottomToolbar
					mode={inputMode}
					onModeChange={setInputMode}
					thinkingLevel={thinkingLevel}
					onThinkingLevelChange={(level) => {
						void onThinkingLevelChange(level);
					}}
				/>
			</footer>

			{directoryPickerOpen && (
				<DirectoryPicker
					initialPath={currentSession?.cwd ?? "~"}
					onSelect={(path) => {
						void onNewSessionConfirm(path);
					}}
					onCancel={() => setDirectoryPickerOpen(false)}
					listDirectory={listDirectory}
				/>
			)}
		</div>
	);
}
