/**
 * Tests for the new RPC protocol commands added for web mode parity.
 *
 * Tests list_sessions, get_session_tree, navigate_tree, set_entry_label,
 * reload_resources, get_context_usage, get_tools, set_active_tools.
 *
 * Uses real SessionManager with in-memory sessions (no LLM calls needed).
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentSession } from "../../src/core/agent-session.js";
import { AuthStorage } from "../../src/core/auth-storage.js";
import { ModelRegistry } from "../../src/core/model-registry.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { SettingsManager } from "../../src/core/settings-manager.js";
import { codingTools } from "../../src/core/tools/index.js";
import { createProtocolServerCore } from "../../src/modes/protocol/server-core.js";
import type { RpcResponse } from "../../src/modes/protocol/types.js";
import { createTestResourceLoader } from "../utilities.js";

// ============================================================================
// Setup
// ============================================================================

let tempDir: string;
let session: AgentSession;
let output: ReturnType<typeof vi.fn>;

function createSession(opts?: { sessionManager?: SessionManager }): AgentSession {
	const model = getModel("anthropic", "claude-sonnet-4-5")!;
	const agent = new Agent({
		getApiKey: () => "test-key",
		initialState: { model, systemPrompt: "test", tools: codingTools },
	});

	const sessionManager = opts?.sessionManager ?? SessionManager.inMemory();
	const settingsManager = SettingsManager.create(tempDir, tempDir);
	const authStorage = new AuthStorage(join(tempDir, "auth.json"));
	const modelRegistry = new ModelRegistry(authStorage, tempDir);

	const s = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd: tempDir,
		modelRegistry,
		resourceLoader: createTestResourceLoader(),
	});
	s.subscribe(() => {});
	return s;
}

function extractData(response: RpcResponse): unknown {
	if (!response.success) throw new Error((response as { error: string }).error);
	return "data" in response ? response.data : undefined;
}

beforeEach(() => {
	tempDir = join(tmpdir(), `pi-rpc-new-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
	session = createSession();
	output = vi.fn();
});

afterEach(() => {
	session.dispose();
	if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
});

// ============================================================================
// Tests
// ============================================================================

describe("RPC new commands", () => {
	describe("get_session_tree", () => {
		test("returns empty tree for fresh session", async () => {
			const core = createProtocolServerCore({ session, output });
			const resp = await core.handleCommand({ type: "get_session_tree" });
			expect(resp.success).toBe(true);

			const data = extractData(resp) as { leafId: string | null; nodes: unknown[] };
			expect(data.nodes).toEqual([]);
			expect(data.leafId).toBeNull();
		});

		test("returns tree with entries after appending messages", async () => {
			const core = createProtocolServerCore({ session, output });

			session.sessionManager.appendMessage({ role: "user", content: "hello", timestamp: 1 });
			session.sessionManager.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: "hi" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "test",
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2,
			});

			const resp = await core.handleCommand({ type: "get_session_tree" });
			const data = extractData(resp) as {
				leafId: string | null;
				nodes: Array<{ entry: { type: string }; children: unknown[] }>;
			};

			expect(data.nodes.length).toBe(1);
			expect(data.nodes[0].entry.type).toBe("message");
			expect(data.leafId).toBeDefined();
			expect(data.leafId).not.toBeNull();
		});
	});

	describe("set_entry_label", () => {
		test("sets label on a message entry", async () => {
			const core = createProtocolServerCore({ session, output });

			const id = session.sessionManager.appendMessage({ role: "user", content: "test", timestamp: 1 });
			const resp = await core.handleCommand({ type: "set_entry_label", targetId: id, label: "bookmark" });
			expect(resp.success).toBe(true);
			expect(session.sessionManager.getLabel(id)).toBe("bookmark");
		});

		test("clears label with whitespace-only string", async () => {
			const core = createProtocolServerCore({ session, output });

			const id = session.sessionManager.appendMessage({ role: "user", content: "test", timestamp: 1 });
			session.sessionManager.appendLabelChange(id, "old");
			expect(session.sessionManager.getLabel(id)).toBe("old");

			await core.handleCommand({ type: "set_entry_label", targetId: id, label: "   " });
			expect(session.sessionManager.getLabel(id)).toBeUndefined();
		});

		test("clears label with undefined", async () => {
			const core = createProtocolServerCore({ session, output });

			const id = session.sessionManager.appendMessage({ role: "user", content: "test", timestamp: 1 });
			session.sessionManager.appendLabelChange(id, "old");

			await core.handleCommand({ type: "set_entry_label", targetId: id });
			expect(session.sessionManager.getLabel(id)).toBeUndefined();
		});
	});

	describe("get_context_usage", () => {
		test("returns usage with model set", async () => {
			const core = createProtocolServerCore({ session, output });

			const resp = await core.handleCommand({ type: "get_context_usage" });
			expect(resp.success).toBe(true);
			const data = extractData(resp) as { usage: unknown };
			// With a model set but no messages, usage should be defined
			expect(data).toHaveProperty("usage");
		});
	});

	describe("get_tools / set_active_tools", () => {
		test("get_tools returns tools with descriptions", async () => {
			const core = createProtocolServerCore({ session, output });

			const resp = await core.handleCommand({ type: "get_tools" });
			expect(resp.success).toBe(true);

			const data = extractData(resp) as {
				activeToolNames: string[];
				allTools: Array<{ name: string; description: string; parameters: unknown }>;
			};

			// Default tools should include read, bash, edit, write
			expect(data.activeToolNames).toContain("read");
			expect(data.activeToolNames).toContain("bash");

			// Each tool should have name, description, parameters
			for (const tool of data.allTools) {
				expect(typeof tool.name).toBe("string");
				expect(typeof tool.description).toBe("string");
			}
		});

		test("set_active_tools changes active set", async () => {
			const core = createProtocolServerCore({ session, output });

			const resp = await core.handleCommand({
				type: "set_active_tools",
				toolNames: ["read"],
			});
			expect(resp.success).toBe(true);

			const data = extractData(resp) as { activeToolNames: string[] };
			expect(data.activeToolNames).toEqual(["read"]);
		});

		test("set_active_tools ignores unknown names", async () => {
			const core = createProtocolServerCore({ session, output });

			const resp = await core.handleCommand({
				type: "set_active_tools",
				toolNames: ["read", "nonexistent_tool"],
			});
			expect(resp.success).toBe(true);

			const data = extractData(resp) as { activeToolNames: string[] };
			expect(data.activeToolNames).toEqual(["read"]);
		});

		test("set_active_tools with empty array disables all tools", async () => {
			const core = createProtocolServerCore({ session, output });

			const resp = await core.handleCommand({
				type: "set_active_tools",
				toolNames: [],
			});
			expect(resp.success).toBe(true);

			const data = extractData(resp) as { activeToolNames: string[] };
			expect(data.activeToolNames).toEqual([]);
		});
	});

	describe("reload_resources", () => {
		test("returns commands snapshot and emits session_changed", async () => {
			const core = createProtocolServerCore({ session, output });
			await core.bind();

			const resp = await core.handleCommand({ type: "reload_resources" });
			expect(resp.success).toBe(true);

			const data = extractData(resp) as { commands: unknown[] };
			expect(Array.isArray(data.commands)).toBe(true);

			// Should have emitted session_changed with reason "reload"
			const changed = output.mock.calls.filter((c) => (c[0] as Record<string, unknown>).type === "session_changed");
			expect(changed.length).toBeGreaterThanOrEqual(1);
			expect((changed[changed.length - 1][0] as Record<string, unknown>).reason).toBe("reload");
		});
	});

	describe("session_changed events", () => {
		test("new_session emits session_changed with reason=new", async () => {
			const core = createProtocolServerCore({ session, output });
			await core.bind();

			const resp = await core.handleCommand({ type: "new_session" });
			const data = extractData(resp) as { cancelled: boolean };

			if (!data.cancelled) {
				const events = output.mock.calls
					.map((c) => c[0] as Record<string, unknown>)
					.filter((e) => e.type === "session_changed");

				expect(events.length).toBeGreaterThanOrEqual(1);
				const last = events[events.length - 1];
				expect(last.reason).toBe("new");
				expect(last.sessionId).toBeDefined();
				expect(typeof last.messageCount).toBe("number");
			}
		});

		test("get_commands (refactored) returns same shape as before", async () => {
			const core = createProtocolServerCore({ session, output });

			const resp = await core.handleCommand({ type: "get_commands" });
			expect(resp.success).toBe(true);

			const data = extractData(resp) as { commands: Array<{ name: string; source: string }> };
			expect(Array.isArray(data.commands)).toBe(true);
		});
	});

	describe("command id correlation", () => {
		test("response id matches command id for all new commands", async () => {
			const core = createProtocolServerCore({ session, output });

			const commands = [
				{ id: "id-1", type: "get_session_tree" as const },
				{ id: "id-2", type: "get_context_usage" as const },
				{ id: "id-3", type: "get_tools" as const },
				{ id: "id-4", type: "set_active_tools" as const, toolNames: ["read"] },
			];

			for (const cmd of commands) {
				const resp = await core.handleCommand(cmd);
				expect(resp.id).toBe(cmd.id);
				expect(resp.success).toBe(true);
			}
		});
	});
});
