/**
 * Shared protocol server core.
 *
 * Contains command dispatch and session event fanout logic that is reused
 * by both the stdio-based RPC transport and the WebSocket-based web transport.
 */

import type { AgentSession } from "../../core/agent-session.js";
import { SessionManager } from "../../core/session-manager.js";
import { createExtensionUIBridge, type ExtensionUIBridge } from "./extension-ui-bridge.js";
import type {
	RpcCommand,
	RpcExtensionUIResponse,
	RpcResponse,
	RpcSessionState,
	RpcSessionSummary,
	RpcSessionTree,
	RpcSessionTreeEntry,
	RpcSessionTreeNode,
	RpcSlashCommand,
	RpcToolInfo,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

export type OutputFn = (obj: object) => void;

export interface ProtocolServerCoreOptions {
	session: AgentSession;
	output: OutputFn;
}

export interface ProtocolServerCore {
	/** Handle a parsed command and return the response */
	handleCommand(command: RpcCommand): Promise<RpcResponse>;
	/** Route an extension UI response to the bridge */
	handleExtensionUIResponse(response: RpcExtensionUIResponse): void;
	/** The extension UI bridge (for session.bindExtensions) */
	extensionUIBridge: ExtensionUIBridge;
	/** Bind extensions and subscribe to session events. Call once after creation. */
	bind(): Promise<void>;
	/** Whether a shutdown has been requested by an extension */
	shutdownRequested: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function getCommandsSnapshot(session: AgentSession): RpcSlashCommand[] {
	const commands: RpcSlashCommand[] = [];

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
			location: template.source as RpcSlashCommand["location"],
			path: template.filePath,
		});
	}

	for (const skill of session.resourceLoader.getSkills().skills) {
		commands.push({
			name: `skill:${skill.name}`,
			description: skill.description,
			source: "skill",
			location: skill.source as RpcSlashCommand["location"],
			path: skill.filePath,
		});
	}

	return commands;
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

interface TreeNodeLike {
	entry: { id: string; parentId: string | null; type: string; timestamp: string; [key: string]: unknown };
	children: TreeNodeLike[];
	label?: string;
}

function mapTreeNode(node: TreeNodeLike): RpcSessionTreeNode {
	const entry: RpcSessionTreeEntry = {
		id: node.entry.id,
		parentId: node.entry.parentId,
		type: node.entry.type,
		timestamp: node.entry.timestamp,
		label: node.label,
		preview: extractPreviewText(node.entry as unknown as Record<string, unknown>),
	};

	return {
		entry,
		children: (node.children ?? []).map((child) => mapTreeNode(child)),
	};
}

// ============================================================================
// Factory
// ============================================================================

export function createProtocolServerCore(opts: ProtocolServerCoreOptions): ProtocolServerCore {
	const { session, output } = opts;
	let shutdownRequested = false;

	const extensionUIBridge = createExtensionUIBridge(output);

	// Helpers -----------------------------------------------------------

	const success = <T extends RpcCommand["type"]>(
		id: string | undefined,
		command: T,
		data?: object | null,
	): RpcResponse => {
		if (data === undefined) {
			return { id, type: "response", command, success: true } as RpcResponse;
		}
		return { id, type: "response", command, success: true, data } as RpcResponse;
	};

	const error = (id: string | undefined, command: string, message: string): RpcResponse => {
		return { id, type: "response", command, success: false, error: message };
	};

	const emitSessionChanged = (reason: "new" | "switch" | "fork" | "tree" | "reload") => {
		output({
			type: "session_changed",
			reason,
			sessionId: session.sessionId,
			sessionFile: session.sessionFile,
			sessionName: session.sessionName,
			messageCount: session.messages.length,
			leafId: session.sessionManager.getLeafId(),
		});
	};

	// Command dispatch ---------------------------------------------------

	const handleCommand = async (command: RpcCommand): Promise<RpcResponse> => {
		const id = command.id;

		switch (command.type) {
			// ==== Prompting ====

			case "prompt": {
				session
					.prompt(command.message, {
						images: command.images,
						streamingBehavior: command.streamingBehavior,
						source: "rpc",
					})
					.catch((e) => output(error(id, "prompt", (e as Error).message)));
				return success(id, "prompt");
			}

			case "steer": {
				await session.steer(command.message, command.images);
				return success(id, "steer");
			}

			case "follow_up": {
				await session.followUp(command.message, command.images);
				return success(id, "follow_up");
			}

			case "abort": {
				await session.abort();
				return success(id, "abort");
			}

			case "new_session": {
				const options = command.parentSession ? { parentSession: command.parentSession } : undefined;
				const cancelled = !(await session.newSession(options));
				if (!cancelled) {
					emitSessionChanged("new");
				}
				return success(id, "new_session", { cancelled });
			}

			// ==== State ====

			case "get_state": {
				const state: RpcSessionState = {
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
				};
				return success(id, "get_state", state);
			}

			// ==== Model ====

			case "set_model": {
				const models = await session.modelRegistry.getAvailable();
				const model = models.find((m) => m.provider === command.provider && m.id === command.modelId);
				if (!model) {
					return error(id, "set_model", `Model not found: ${command.provider}/${command.modelId}`);
				}
				await session.setModel(model);
				return success(id, "set_model", model);
			}

			case "cycle_model": {
				const result = await session.cycleModel();
				if (!result) {
					return success(id, "cycle_model", null);
				}
				return success(id, "cycle_model", result);
			}

			case "get_available_models": {
				const models = await session.modelRegistry.getAvailable();
				return success(id, "get_available_models", { models });
			}

			// ==== Thinking ====

			case "set_thinking_level": {
				session.setThinkingLevel(command.level);
				return success(id, "set_thinking_level");
			}

			case "cycle_thinking_level": {
				const level = session.cycleThinkingLevel();
				if (!level) {
					return success(id, "cycle_thinking_level", null);
				}
				return success(id, "cycle_thinking_level", { level });
			}

			// ==== Queue modes ====

			case "set_steering_mode": {
				session.setSteeringMode(command.mode);
				return success(id, "set_steering_mode");
			}

			case "set_follow_up_mode": {
				session.setFollowUpMode(command.mode);
				return success(id, "set_follow_up_mode");
			}

			// ==== Compaction ====

			case "compact": {
				const result = await session.compact(command.customInstructions);
				return success(id, "compact", result);
			}

			case "set_auto_compaction": {
				session.setAutoCompactionEnabled(command.enabled);
				return success(id, "set_auto_compaction");
			}

			// ==== Retry ====

			case "set_auto_retry": {
				session.setAutoRetryEnabled(command.enabled);
				return success(id, "set_auto_retry");
			}

			case "abort_retry": {
				session.abortRetry();
				return success(id, "abort_retry");
			}

			// ==== Bash ====

			case "bash": {
				const result = await session.executeBash(command.command);
				return success(id, "bash", result);
			}

			case "abort_bash": {
				session.abortBash();
				return success(id, "abort_bash");
			}

			// ==== Session ====

			case "get_session_stats": {
				const stats = session.getSessionStats();
				return success(id, "get_session_stats", stats);
			}

			case "export_html": {
				const path = await session.exportToHtml(command.outputPath);
				return success(id, "export_html", { path });
			}

			case "switch_session": {
				const cancelled = !(await session.switchSession(command.sessionPath));
				if (!cancelled) {
					emitSessionChanged("switch");
				}
				return success(id, "switch_session", { cancelled });
			}

			case "fork": {
				const result = await session.fork(command.entryId);
				if (!result.cancelled) {
					emitSessionChanged("fork");
				}
				return success(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
			}

			case "get_fork_messages": {
				const messages = session.getUserMessagesForForking();
				return success(id, "get_fork_messages", { messages });
			}

			case "get_last_assistant_text": {
				const text = session.getLastAssistantText();
				return success(id, "get_last_assistant_text", { text });
			}

			case "set_session_name": {
				const name = command.name.trim();
				if (!name) {
					return error(id, "set_session_name", "Session name cannot be empty");
				}
				session.setSessionName(name);
				return success(id, "set_session_name");
			}

			// ==== Messages ====

			case "get_messages": {
				return success(id, "get_messages", { messages: session.messages });
			}

			// ==== Commands ====

			case "get_commands": {
				return success(id, "get_commands", { commands: getCommandsSnapshot(session) });
			}

			// ==== Session tree & navigation ====

			case "list_sessions": {
				const scope = command.scope ?? "cwd";
				const sessions =
					scope === "all"
						? await SessionManager.listAll()
						: await SessionManager.list(session.sessionManager.getCwd(), command.sessionDir);

				const data: RpcSessionSummary[] = sessions.map((s) => ({
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

				return success(id, "list_sessions", { sessions: data });
			}

			case "get_session_tree": {
				const roots = session.sessionManager.getTree();
				const tree: RpcSessionTree = {
					leafId: session.sessionManager.getLeafId(),
					nodes: roots.map((n) => mapTreeNode(n as unknown as TreeNodeLike)),
				};
				return success(id, "get_session_tree", tree);
			}

			case "navigate_tree": {
				const result = await session.navigateTree(command.targetId, {
					summarize: command.summarize,
					customInstructions: command.customInstructions,
					replaceInstructions: command.replaceInstructions,
					label: command.label,
				});

				if (!result.cancelled) {
					emitSessionChanged("tree");
				}

				return success(id, "navigate_tree", {
					cancelled: result.cancelled,
					editorText: result.editorText,
				});
			}

			case "set_entry_label": {
				const normalized = command.label?.trim();
				session.sessionManager.appendLabelChange(command.targetId, normalized ? normalized : undefined);
				return success(id, "set_entry_label");
			}

			// ==== Resources & tools ====

			case "reload_resources": {
				await session.reload();
				emitSessionChanged("reload");
				return success(id, "reload_resources", { commands: getCommandsSnapshot(session) });
			}

			case "get_context_usage": {
				const usage = session.getContextUsage();
				return success(id, "get_context_usage", { usage });
			}

			case "get_tools": {
				const activeToolNames = session.getActiveToolNames();
				const allTools: RpcToolInfo[] = session.getAllTools().map((t) => ({
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				}));
				return success(id, "get_tools", { activeToolNames, allTools });
			}

			case "set_active_tools": {
				session.setActiveToolsByName(command.toolNames);
				return success(id, "set_active_tools", {
					activeToolNames: session.getActiveToolNames(),
				});
			}

			default: {
				const unknownCommand = command as { type: string };
				return error(undefined, unknownCommand.type, `Unknown command: ${unknownCommand.type}`);
			}
		}
	};

	// Bind lifecycle ---------------------------------------------------

	const bind = async (): Promise<void> => {
		// Subscribe to all agent events
		session.subscribe((event) => {
			output(event);
		});

		// Bind extensions with protocol UI bridge
		await session.bindExtensions({
			uiContext: extensionUIBridge.uiContext,
			commandContextActions: {
				waitForIdle: () => session.agent.waitForIdle(),
				newSession: async (options) => {
					const ok = await session.newSession(options);
					return { cancelled: !ok };
				},
				fork: async (entryId) => {
					const result = await session.fork(entryId);
					return { cancelled: result.cancelled };
				},
				navigateTree: async (targetId, options) => {
					const result = await session.navigateTree(targetId, {
						summarize: options?.summarize,
						customInstructions: options?.customInstructions,
						replaceInstructions: options?.replaceInstructions,
						label: options?.label,
					});
					return { cancelled: result.cancelled };
				},
				switchSession: async (sessionPath) => {
					const ok = await session.switchSession(sessionPath);
					return { cancelled: !ok };
				},
				reload: async () => {
					await session.reload();
				},
			},
			shutdownHandler: () => {
				shutdownRequested = true;
			},
			onError: (err) => {
				output({
					type: "extension_error",
					extensionPath: err.extensionPath,
					event: err.event,
					error: err.error,
				});
			},
		});
	};

	return {
		handleCommand,
		handleExtensionUIResponse: (r) => extensionUIBridge.resolveResponse(r),
		extensionUIBridge,
		bind,
		get shutdownRequested() {
			return shutdownRequested;
		},
	};
}
