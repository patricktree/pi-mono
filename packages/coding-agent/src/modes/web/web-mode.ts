/**
 * Web mode: HTTP + WebSocket server for browser-based agent interaction.
 *
 * Uses the AgentSession SDK directly instead of the shared protocol server
 * core. Incoming WebSocket commands are mapped to session method calls;
 * session events are broadcast to all connected clients.
 */

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { AgentSession } from "../../core/agent-session.js";
import { SessionManager } from "../../core/session-manager.js";
import { createExtensionUIBridge } from "../protocol/extension-ui-bridge.js";
import type { RpcExtensionUIResponse } from "../protocol/types.js";
import { createHttpServer } from "./http-server.js";
import { createWebSocketServer, type WebSocketClient } from "./ws-transport.js";

// ============================================================================
// Types
// ============================================================================

export interface WebModeOptions {
	host: string;
	port: number;
	/** Open browser automatically after starting */
	open: boolean;
	/** Optional auth token */
	token?: string;
	/** Extra allowed origins for WebSocket CORS (e.g. reverse proxy origins) */
	allowedOrigins?: string[];
	/** Path to custom static UI build directory */
	serveUiPath?: string;
}

/** Minimal command shape parsed from incoming WebSocket JSON. */
interface Command {
	id?: string;
	type: string;
	[key: string]: unknown;
}

/** Response shape matching what the frontend expects. */
interface Response {
	id?: string;
	type: "response";
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

// ============================================================================
// Entry point
// ============================================================================

/**
 * Run in web mode.
 * Starts an HTTP server that serves a UI and a WebSocket endpoint.
 * Commands from the browser are handled via direct AgentSession SDK calls.
 */
export async function runWebMode(session: AgentSession, options: WebModeOptions): Promise<never> {
	const { host, port, open, token, allowedOrigins: extraAllowedOrigins, serveUiPath: explicitServeUiPath } = options;
	const serveUiPath = resolveServeUiPath(explicitServeUiPath);

	// Security warning for public binding
	if (host === "0.0.0.0") {
		console.warn("\x1b[33m⚠ WARNING: Binding to 0.0.0.0 exposes this server to all network interfaces.\x1b[0m");
		if (!token) {
			console.warn("\x1b[33m  Consider using --web-token to require authentication.\x1b[0m");
		}
	}

	// Create WebSocket server
	const allowedOrigins: string[] = [];
	if (host === "127.0.0.1" || host === "localhost") {
		allowedOrigins.push(`http://${host}:${port}`, `http://localhost:${port}`, `http://127.0.0.1:${port}`);
	}
	if (extraAllowedOrigins) {
		allowedOrigins.push(...extraAllowedOrigins);
	}

	const wsServer = createWebSocketServer({
		token,
		allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
	});

	// Broadcast helper — sends a JSON object to all connected clients
	const broadcast = (obj: object): void => {
		wsServer.broadcast(obj);
	};

	// Subscribe to all session events and broadcast them
	session.subscribe((event) => {
		broadcast(event);
	});

	// Extension UI bridge — serialises extension dialogs over WebSocket
	const extensionUIBridge = createExtensionUIBridge(broadcast);
	let shutdownRequested = false;

	// Bind extensions with the UI bridge
	await session.bindExtensions({
		uiContext: extensionUIBridge.uiContext,
		commandContextActions: {
			waitForIdle: () => session.agent.waitForIdle(),
			newSession: async (opts) => {
				const ok = await session.newSession(opts);
				if (ok) emitSessionChanged(session, broadcast, "new");
				return { cancelled: !ok };
			},
			fork: async (entryId) => {
				const result = await session.fork(entryId);
				if (!result.cancelled) emitSessionChanged(session, broadcast, "fork");
				return { cancelled: result.cancelled };
			},
			navigateTree: async (targetId, opts) => {
				const result = await session.navigateTree(targetId, {
					summarize: opts?.summarize,
					customInstructions: opts?.customInstructions,
					replaceInstructions: opts?.replaceInstructions,
					label: opts?.label,
				});
				if (!result.cancelled) emitSessionChanged(session, broadcast, "tree");
				return { cancelled: result.cancelled };
			},
			switchSession: async (sessionPath) => {
				const ok = await session.switchSession(sessionPath);
				if (ok) emitSessionChanged(session, broadcast, "switch");
				return { cancelled: !ok };
			},
			reload: async () => {
				await session.reload();
				emitSessionChanged(session, broadcast, "reload");
			},
		},
		shutdownHandler: () => {
			shutdownRequested = true;
		},
		onError: (err) => {
			broadcast({
				type: "extension_error",
				extensionPath: err.extensionPath,
				event: err.event,
				error: err.error,
			});
		},
	});

	// Handle incoming WebSocket messages
	wsServer.onMessage(async (client: WebSocketClient, data: unknown) => {
		if (!data || typeof data !== "object") return;

		const parsed = data as Record<string, unknown>;

		// Handle extension UI responses
		if (parsed.type === "extension_ui_response") {
			extensionUIBridge.resolveResponse(parsed as unknown as RpcExtensionUIResponse);
			return;
		}

		// Handle commands
		const command = parsed as Command;
		const response = await handleCommand(session, command, broadcast);
		client.send(response);

		// Check for shutdown
		if (shutdownRequested) {
			const currentRunner = session.extensionRunner;
			if (currentRunner?.hasHandlers("session_shutdown")) {
				await currentRunner.emit({ type: "session_shutdown" });
			}
			await httpServer.close();
			process.exit(0);
		}
	});

	wsServer.onClose((_client) => {
		// Client disconnected – nothing specific to do in single-session mode
	});

	// Create and start HTTP server
	const httpServer = createHttpServer({
		host,
		port,
		serveUiPath,
		wsServer,
		token,
	});

	const boundPort = await httpServer.listen();
	const displayHost = host === "0.0.0.0" ? "localhost" : host;
	const url = `http://${displayHost}:${boundPort}`;
	const wsUrl = `ws://${displayHost}:${boundPort}/ws${token ? `?token=${token}` : ""}`;
	const uiUrl = token ? `${url}/?token=${encodeURIComponent(token)}` : url;

	console.log(`\x1b[1mpi web mode\x1b[0m`);
	console.log(`  UI:        ${uiUrl}`);
	console.log(`  WebSocket: ${wsUrl}`);
	if (serveUiPath) {
		console.log(`  Static UI: ${serveUiPath}`);
	} else {
		console.log(`  Static UI: built-in fallback`);
	}
	if (token) {
		console.log(`  Token:     ${token}`);
	}
	console.log();

	// Open browser if requested
	if (open) {
		openBrowser(uiUrl);
	}

	// Keep process alive
	return new Promise(() => {});
}

// ============================================================================
// Command handler — maps incoming JSON commands to AgentSession SDK calls
// ============================================================================

async function handleCommand(
	session: AgentSession,
	command: Command,
	broadcast: (obj: object) => void,
): Promise<Response> {
	const id = command.id;

	try {
		switch (command.type) {
			// ==== Prompting ====

			case "prompt": {
				session
					.prompt(command.message as string, {
						images: command.images as undefined,
						streamingBehavior: command.streamingBehavior as undefined,
						source: "rpc",
					})
					.catch((e) => broadcast(errorResponse(id, "prompt", (e as Error).message)));
				return successResponse(id, "prompt");
			}

			case "steer": {
				await session.steer(command.message as string, command.images as undefined);
				return successResponse(id, "steer");
			}

			case "follow_up": {
				await session.followUp(command.message as string, command.images as undefined);
				return successResponse(id, "follow_up");
			}

			case "abort": {
				await session.abort();
				return successResponse(id, "abort");
			}

			case "clear_queue": {
				const cleared = session.clearQueue();
				return successResponse(id, "clear_queue", cleared);
			}

			case "new_session": {
				const opts = command.parentSession ? { parentSession: command.parentSession as string } : undefined;
				const cancelled = !(await session.newSession(opts));
				if (!cancelled) emitSessionChanged(session, broadcast, "new");
				return successResponse(id, "new_session", { cancelled });
			}

			// ==== State ====

			case "get_state": {
				return successResponse(id, "get_state", {
					model: session.model,
					thinkingLevel: session.thinkingLevel,
					isStreaming: session.isStreaming,
					isCompacting: session.isCompacting,
					steeringMode: session.steeringMode,
					followUpMode: session.followUpMode,
					sessionFile: session.sessionFile,
					sessionId: session.sessionId,
					sessionName: session.sessionName,
					autoCompactionEnabled: session.autoCompactionEnabled,
					messageCount: session.messages.length,
					pendingMessageCount: session.pendingMessageCount,
				});
			}

			// ==== Model ====

			case "set_model": {
				const models = await session.modelRegistry.getAvailable();
				const model = models.find((m) => m.provider === command.provider && m.id === command.modelId);
				if (!model) {
					return errorResponse(id, "set_model", `Model not found: ${command.provider}/${command.modelId}`);
				}
				await session.setModel(model);
				return successResponse(id, "set_model", model);
			}

			case "cycle_model": {
				const result = await session.cycleModel();
				return successResponse(id, "cycle_model", result ?? null);
			}

			case "get_available_models": {
				const models = await session.modelRegistry.getAvailable();
				return successResponse(id, "get_available_models", { models });
			}

			// ==== Thinking ====

			case "set_thinking_level": {
				session.setThinkingLevel(command.level as ThinkingLevel);
				return successResponse(id, "set_thinking_level");
			}

			case "cycle_thinking_level": {
				const level = session.cycleThinkingLevel();
				return successResponse(id, "cycle_thinking_level", level ? { level } : null);
			}

			// ==== Queue modes ====

			case "set_steering_mode": {
				session.setSteeringMode(command.mode as "all" | "one-at-a-time");
				return successResponse(id, "set_steering_mode");
			}

			case "set_follow_up_mode": {
				session.setFollowUpMode(command.mode as "all" | "one-at-a-time");
				return successResponse(id, "set_follow_up_mode");
			}

			// ==== Compaction ====

			case "compact": {
				const result = await session.compact(command.customInstructions as string | undefined);
				return successResponse(id, "compact", result);
			}

			case "set_auto_compaction": {
				session.setAutoCompactionEnabled(command.enabled as boolean);
				return successResponse(id, "set_auto_compaction");
			}

			// ==== Retry ====

			case "set_auto_retry": {
				session.setAutoRetryEnabled(command.enabled as boolean);
				return successResponse(id, "set_auto_retry");
			}

			case "abort_retry": {
				session.abortRetry();
				return successResponse(id, "abort_retry");
			}

			// ==== Bash ====

			case "bash": {
				const result = await session.executeBash(command.command as string);
				return successResponse(id, "bash", result);
			}

			case "abort_bash": {
				session.abortBash();
				return successResponse(id, "abort_bash");
			}

			// ==== Session ====

			case "get_session_stats": {
				const stats = session.getSessionStats();
				return successResponse(id, "get_session_stats", stats);
			}

			case "export_html": {
				const path = await session.exportToHtml(command.outputPath as string | undefined);
				return successResponse(id, "export_html", { path });
			}

			case "switch_session": {
				const cancelled = !(await session.switchSession(command.sessionPath as string));
				if (!cancelled) emitSessionChanged(session, broadcast, "switch");
				return successResponse(id, "switch_session", { cancelled });
			}

			case "fork": {
				const result = await session.fork(command.entryId as string);
				if (!result.cancelled) emitSessionChanged(session, broadcast, "fork");
				return successResponse(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
			}

			case "get_fork_messages": {
				const messages = session.getUserMessagesForForking();
				return successResponse(id, "get_fork_messages", { messages });
			}

			case "get_last_assistant_text": {
				const text = session.getLastAssistantText();
				return successResponse(id, "get_last_assistant_text", { text });
			}

			case "set_session_name": {
				const name = (command.name as string).trim();
				if (!name) {
					return errorResponse(id, "set_session_name", "Session name cannot be empty");
				}
				session.setSessionName(name);
				return successResponse(id, "set_session_name");
			}

			// ==== Messages ====

			case "get_messages": {
				return successResponse(id, "get_messages", { messages: session.messages });
			}

			// ==== Commands ====

			case "get_commands": {
				return successResponse(id, "get_commands", { commands: getCommandsSnapshot(session) });
			}

			// ==== Session tree & navigation ====

			case "list_sessions": {
				const scope = (command.scope as string) ?? "cwd";
				const sessions =
					scope === "all"
						? await SessionManager.listAll()
						: await SessionManager.list(
								session.sessionManager.getCwd(),
								command.sessionDir as string | undefined,
							);

				const data = sessions.map((s) => ({
					path: s.path,
					id: s.id,
					cwd: s.cwd,
					name: s.name,
					parentSessionPath: s.parentSessionPath,
					created: s.created.toISOString(),
					modified: s.modified.toISOString(),
					messageCount: s.messageCount,
					firstMessage: s.firstMessage,
					allMessagesText: s.allMessagesText,
				}));

				return successResponse(id, "list_sessions", { sessions: data });
			}

			case "get_session_tree": {
				const roots = session.sessionManager.getTree();
				return successResponse(id, "get_session_tree", {
					leafId: session.sessionManager.getLeafId(),
					nodes: roots.map((n) => mapTreeNode(n)),
				});
			}

			case "navigate_tree": {
				const result = await session.navigateTree(command.targetId as string, {
					summarize: command.summarize as boolean | undefined,
					customInstructions: command.customInstructions as string | undefined,
					replaceInstructions: command.replaceInstructions as boolean | undefined,
					label: command.label as string | undefined,
				});

				if (!result.cancelled) emitSessionChanged(session, broadcast, "tree");

				return successResponse(id, "navigate_tree", {
					cancelled: result.cancelled,
					editorText: result.editorText,
				});
			}

			case "set_entry_label": {
				const normalized = (command.label as string | undefined)?.trim();
				session.sessionManager.appendLabelChange(command.targetId as string, normalized || undefined);
				return successResponse(id, "set_entry_label");
			}

			// ==== Resources & tools ====

			case "reload_resources": {
				await session.reload();
				emitSessionChanged(session, broadcast, "reload");
				return successResponse(id, "reload_resources", { commands: getCommandsSnapshot(session) });
			}

			case "get_context_usage": {
				const usage = session.getContextUsage();
				return successResponse(id, "get_context_usage", { usage });
			}

			case "get_tools": {
				const activeToolNames = session.getActiveToolNames();
				const allTools = session.getAllTools().map((t) => ({
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				}));
				return successResponse(id, "get_tools", { activeToolNames, allTools });
			}

			case "set_active_tools": {
				session.setActiveToolsByName(command.toolNames as string[]);
				return successResponse(id, "set_active_tools", {
					activeToolNames: session.getActiveToolNames(),
				});
			}

			default: {
				return errorResponse(id, command.type, `Unknown command: ${command.type}`);
			}
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return errorResponse(id, command.type, message);
	}
}

// ============================================================================
// Response helpers
// ============================================================================

function successResponse(id: string | undefined, command: string, data?: unknown): Response {
	if (data === undefined) {
		return { id, type: "response", command, success: true };
	}
	return { id, type: "response", command, success: true, data };
}

function errorResponse(id: string | undefined, command: string, message: string): Response {
	return { id, type: "response", command, success: false, error: message };
}

// ============================================================================
// Session helpers
// ============================================================================

function emitSessionChanged(
	session: AgentSession,
	broadcast: (obj: object) => void,
	reason: "new" | "switch" | "fork" | "tree" | "reload",
): void {
	broadcast({
		type: "session_changed",
		reason,
		sessionId: session.sessionId,
		sessionFile: session.sessionFile,
		sessionName: session.sessionName,
		messageCount: session.messages.length,
		leafId: session.sessionManager.getLeafId(),
	});
}

function getCommandsSnapshot(session: AgentSession): Array<{
	name: string;
	description?: string;
	source: string;
	location?: string;
	path?: string;
}> {
	const commands: Array<{
		name: string;
		description?: string;
		source: string;
		location?: string;
		path?: string;
	}> = [];

	for (const { command, extensionPath } of session.extensionRunner?.getRegisteredCommandsWithPaths() ?? []) {
		commands.push({
			name: command.name,
			description: command.description,
			source: "extension",
			path: extensionPath,
		});
	}

	for (const template of session.promptTemplates) {
		commands.push({
			name: template.name,
			description: template.description,
			source: "prompt",
			location: template.source,
			path: template.filePath,
		});
	}

	for (const skill of session.resourceLoader.getSkills().skills) {
		commands.push({
			name: `skill:${skill.name}`,
			description: skill.description,
			source: "skill",
			location: skill.source,
			path: skill.filePath,
		});
	}

	return commands;
}

// ============================================================================
// Session tree helpers
// ============================================================================

interface TreeNode {
	entry: { id: string; parentId: string | null; type: string; timestamp: string; [key: string]: unknown };
	children: TreeNode[];
	label?: string;
}

function mapTreeNode(node: unknown): object {
	const n = node as TreeNode;
	return {
		entry: {
			id: n.entry.id,
			parentId: n.entry.parentId,
			type: n.entry.type,
			timestamp: n.entry.timestamp,
			label: n.label,
			preview: extractPreviewText(n.entry),
		},
		children: (n.children ?? []).map((child) => mapTreeNode(child)),
	};
}

function extractPreviewText(entry: Record<string, unknown>): string | undefined {
	if (!entry || typeof entry !== "object") return undefined;

	if (entry.type === "message") {
		const msg = entry.message as Record<string, unknown> | undefined;
		if (!msg) return undefined;

		if (msg.role === "user") {
			if (typeof msg.content === "string") return msg.content.slice(0, 140);
			if (Array.isArray(msg.content)) {
				const text = (msg.content as Array<Record<string, unknown>>)
					.filter((c) => c?.type === "text" && typeof c.text === "string")
					.map((c) => c.text as string)
					.join(" ");
				return text.slice(0, 140) || undefined;
			}
			return undefined;
		}

		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			const text = (msg.content as Array<Record<string, unknown>>)
				.filter((c) => c?.type === "text" && typeof c.text === "string")
				.map((c) => c.text as string)
				.join(" ");
			return text.slice(0, 140) || undefined;
		}

		if (msg.role === "toolResult") {
			return `[toolResult:${msg.toolName as string}]`;
		}
	}

	if (entry.type === "compaction") return "[compaction]";
	if (entry.type === "branch_summary") return "[branch_summary]";
	if (entry.type === "custom_message") return "[custom_message]";
	if (entry.type === "custom") return "[custom]";
	if (entry.type === "model_change") return `[model:${entry.provider as string}/${entry.modelId as string}]`;
	if (entry.type === "thinking_level_change") return `[thinking:${entry.thinkingLevel as string}]`;
	if (entry.type === "label") return `[label:${(entry.label as string) ?? ""}]`;
	if (entry.type === "session_info") return `[session_info:${(entry.name as string) ?? ""}]`;

	return undefined;
}

// ============================================================================
// Path helpers
// ============================================================================

function resolveServeUiPath(explicitPath?: string): string | undefined {
	if (explicitPath) {
		return explicitPath;
	}

	const currentDir = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		resolve(currentDir, "../../../../coding-agent-web/dist"),
		resolve(currentDir, "../../../web-ui"),
	];

	for (const candidate of candidates) {
		if (existsSync(join(candidate, "index.html"))) {
			return candidate;
		}
	}

	return undefined;
}

function openBrowser(url: string): void {
	const plat = platform();
	let cmd: string;
	if (plat === "darwin") {
		cmd = `open "${url}"`;
	} else if (plat === "win32") {
		cmd = `start "" "${url}"`;
	} else {
		cmd = `xdg-open "${url}"`;
	}
	exec(cmd, (err) => {
		if (err) {
			console.warn(`Could not open browser: ${err.message}`);
		}
	});
}
