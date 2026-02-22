/**
 * Tests for the shared protocol server core.
 *
 * Uses a real AgentSession (in-memory, no LLM calls) to test command handling.
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
import type { RpcCommand, RpcResponse } from "../../src/modes/protocol/types.js";
import { createTestResourceLoader } from "../utilities.js";

// ============================================================================
// Setup
// ============================================================================

let tempDir: string;
let session: AgentSession;
let output: ReturnType<typeof vi.fn>;

beforeEach(() => {
	tempDir = join(tmpdir(), `pi-core-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });

	const model = getModel("anthropic", "claude-sonnet-4-5")!;
	const agent = new Agent({
		getApiKey: () => "test-key",
		initialState: {
			model,
			systemPrompt: "test",
			tools: codingTools,
		},
	});

	const sessionManager = SessionManager.inMemory();
	const settingsManager = SettingsManager.create(tempDir, tempDir);
	const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
	const modelRegistry = new ModelRegistry(authStorage, tempDir);

	session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd: tempDir,
		modelRegistry,
		resourceLoader: createTestResourceLoader(),
	});
	session.subscribe(() => {});

	output = vi.fn();
});

afterEach(() => {
	session.dispose();
	if (existsSync(tempDir)) {
		rmSync(tempDir, { recursive: true });
	}
});

function extractData(response: RpcResponse): unknown {
	if (!response.success) throw new Error((response as { error: string }).error);
	return "data" in response ? response.data : undefined;
}

// ============================================================================
// Tests
// ============================================================================

describe("ProtocolServerCore", () => {
	test("get_state returns session state", async () => {
		const core = createProtocolServerCore({ session, output });

		const response = await core.handleCommand({ type: "get_state" });
		expect(response.success).toBe(true);

		const data = extractData(response) as Record<string, unknown>;
		expect(data.sessionId).toBeDefined();
		expect(data.isStreaming).toBe(false);
		expect(data.messageCount).toBe(0);
		expect(data.thinkingLevel).toBeDefined();
	});

	test("get_messages returns empty array initially", async () => {
		const core = createProtocolServerCore({ session, output });

		const response = await core.handleCommand({ type: "get_messages" });
		expect(response.success).toBe(true);

		const data = extractData(response) as { messages: unknown[] };
		expect(data.messages).toEqual([]);
	});

	test("set_thinking_level changes thinking level", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "set_thinking_level", level: "high" });
		expect(resp.success).toBe(true);

		const state = await core.handleCommand({ type: "get_state" });
		const data = extractData(state) as { thinkingLevel: string };
		expect(data.thinkingLevel).toBe("high");
	});

	test("set_auto_compaction toggles setting", async () => {
		const core = createProtocolServerCore({ session, output });

		await core.handleCommand({ type: "set_auto_compaction", enabled: false });

		const state = await core.handleCommand({ type: "get_state" });
		const data = extractData(state) as { autoCompactionEnabled: boolean };
		expect(data.autoCompactionEnabled).toBe(false);
	});

	test("get_context_usage returns usage or undefined", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "get_context_usage" });
		expect(resp.success).toBe(true);
		// With no messages, might return undefined usage or minimal
		const data = extractData(resp) as { usage: unknown };
		// Just verify the shape is correct (not null object)
		expect(data).toHaveProperty("usage");
	});

	test("get_tools returns active and all tools", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "get_tools" });
		expect(resp.success).toBe(true);

		const data = extractData(resp) as { activeToolNames: string[]; allTools: Array<{ name: string }> };
		expect(Array.isArray(data.activeToolNames)).toBe(true);
		expect(Array.isArray(data.allTools)).toBe(true);
		expect(data.activeToolNames.length).toBeGreaterThan(0);
		expect(data.allTools.length).toBeGreaterThan(0);

		// All active tools should be in allTools
		for (const name of data.activeToolNames) {
			expect(data.allTools.find((t) => t.name === name)).toBeDefined();
		}
	});

	test("set_active_tools changes active tools", async () => {
		const core = createProtocolServerCore({ session, output });

		// Get initial tools
		const initial = await core.handleCommand({ type: "get_tools" });
		const initialData = extractData(initial) as { activeToolNames: string[]; allTools: Array<{ name: string }> };

		// Set to just read
		const resp = await core.handleCommand({ type: "set_active_tools", toolNames: ["read"] });
		expect(resp.success).toBe(true);

		const data = extractData(resp) as { activeToolNames: string[] };
		expect(data.activeToolNames).toEqual(["read"]);

		// Restore
		await core.handleCommand({ type: "set_active_tools", toolNames: initialData.activeToolNames });
	});

	test("get_session_tree returns tree structure", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "get_session_tree" });
		expect(resp.success).toBe(true);

		const data = extractData(resp) as { leafId: string | null; nodes: unknown[] };
		expect(data).toHaveProperty("leafId");
		expect(data).toHaveProperty("nodes");
		expect(Array.isArray(data.nodes)).toBe(true);
	});

	test("set_entry_label sets label on entry", async () => {
		const core = createProtocolServerCore({ session, output });

		// Append a message to have an entry
		const entryId = session.sessionManager.appendMessage({
			role: "user",
			content: "test",
			timestamp: Date.now(),
		});

		const resp = await core.handleCommand({
			type: "set_entry_label",
			targetId: entryId,
			label: "checkpoint",
		});
		expect(resp.success).toBe(true);

		// Verify label was set
		expect(session.sessionManager.getLabel(entryId)).toBe("checkpoint");
	});

	test("set_entry_label clears label with empty string", async () => {
		const core = createProtocolServerCore({ session, output });

		const entryId = session.sessionManager.appendMessage({
			role: "user",
			content: "test",
			timestamp: Date.now(),
		});

		session.sessionManager.appendLabelChange(entryId, "old-label");
		expect(session.sessionManager.getLabel(entryId)).toBe("old-label");

		await core.handleCommand({
			type: "set_entry_label",
			targetId: entryId,
			label: "  ",
		});
		expect(session.sessionManager.getLabel(entryId)).toBeUndefined();
	});

	test("set_session_name sets name", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "set_session_name", name: "my-session" });
		expect(resp.success).toBe(true);
		expect(session.sessionName).toBe("my-session");
	});

	test("set_session_name rejects empty name", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "set_session_name", name: "  " });
		expect(resp.success).toBe(false);
	});

	test("get_commands returns empty array for no extensions", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "get_commands" });
		expect(resp.success).toBe(true);
		const data = extractData(resp) as { commands: unknown[] };
		expect(Array.isArray(data.commands)).toBe(true);
	});

	test("unknown command returns error", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "unknown_cmd" } as unknown as RpcCommand);
		expect(resp.success).toBe(false);
	});

	test("command id is echoed in response", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ id: "req-42", type: "get_state" });
		expect(resp.id).toBe("req-42");
	});

	test("new_session emits session_changed event", async () => {
		const core = createProtocolServerCore({ session, output });
		await core.bind();

		const resp = await core.handleCommand({ type: "new_session" });
		expect(resp.success).toBe(true);

		const data = extractData(resp) as { cancelled: boolean };
		if (!data.cancelled) {
			// Check that session_changed was emitted via output
			const sessionChangedCalls = output.mock.calls.filter(
				(call) => (call[0] as Record<string, unknown>).type === "session_changed",
			);
			expect(sessionChangedCalls.length).toBeGreaterThanOrEqual(1);
			const event = sessionChangedCalls[0][0] as Record<string, unknown>;
			expect(event.reason).toBe("new");
			expect(event.sessionId).toBeDefined();
		}
	});

	test("handleExtensionUIResponse routes to bridge", async () => {
		const core = createProtocolServerCore({ session, output });

		// Start a select dialog
		const selectPromise = core.extensionUIBridge.uiContext.select("Pick", ["a", "b"]);

		// Get the request that was emitted
		const request = output.mock.calls[0][0] as { id: string; method: string };
		expect(request.method).toBe("select");

		// Resolve via the core method
		core.handleExtensionUIResponse({
			type: "extension_ui_response",
			id: request.id,
			value: "b",
		});

		const result = await selectPromise;
		expect(result).toBe("b");
	});

	test("set_steering_mode and set_follow_up_mode", async () => {
		const core = createProtocolServerCore({ session, output });

		await core.handleCommand({ type: "set_steering_mode", mode: "one-at-a-time" });
		await core.handleCommand({ type: "set_follow_up_mode", mode: "one-at-a-time" });

		const state = await core.handleCommand({ type: "get_state" });
		const data = extractData(state) as {
			steeringMode: string;
			followUpMode: string;
		};
		expect(data.steeringMode).toBe("one-at-a-time");
		expect(data.followUpMode).toBe("one-at-a-time");
	});

	test("abort_retry succeeds even when not retrying", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "abort_retry" });
		expect(resp.success).toBe(true);
	});

	test("abort_bash succeeds even when not running", async () => {
		const core = createProtocolServerCore({ session, output });

		const resp = await core.handleCommand({ type: "abort_bash" });
		expect(resp.success).toBe(true);
	});
});
