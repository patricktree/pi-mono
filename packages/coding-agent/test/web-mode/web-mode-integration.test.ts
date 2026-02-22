/**
 * Integration tests for web mode.
 *
 * Starts the full HTTP + WS server and tests the protocol round-trip
 * through a real WebSocket connection using the `ws` library.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import WebSocket from "ws";
import { AgentSession } from "../../src/core/agent-session.js";
import { AuthStorage } from "../../src/core/auth-storage.js";
import { ModelRegistry } from "../../src/core/model-registry.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { SettingsManager } from "../../src/core/settings-manager.js";
import { codingTools } from "../../src/core/tools/index.js";
import { createProtocolServerCore } from "../../src/modes/protocol/server-core.js";
import { createHttpServer, type HttpServerHandle } from "../../src/modes/web/http-server.js";
import { createWebSocketServer } from "../../src/modes/web/ws-transport.js";
import { createTestResourceLoader } from "../utilities.js";

// ============================================================================
// Helpers
// ============================================================================

function getPort(): Promise<number> {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.listen(0, () => {
			const port = (srv.address() as net.AddressInfo).port;
			srv.close(() => resolve(port));
		});
	});
}

/** Connect a ws client to the integration server. Resolves once open. */
function connectWs(port: number, path = "/ws"): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
		ws.on("open", () => resolve(ws));
		ws.on("error", reject);
	});
}

/** Send a JSON command and return a single JSON response */
function sendAndReceive(ws: WebSocket, data: object): Promise<Record<string, unknown>> {
	return new Promise((resolve) => {
		ws.once("message", (raw) => {
			resolve(JSON.parse(raw.toString("utf8")));
		});
		ws.send(JSON.stringify(data));
	});
}

/** Collect all messages received within a timeout window */
function collectMessages(ws: WebSocket, timeoutMs = 300): Promise<Record<string, unknown>[]> {
	return new Promise((resolve) => {
		const msgs: Record<string, unknown>[] = [];
		const handler = (raw: WebSocket.RawData) => {
			msgs.push(JSON.parse(raw.toString("utf8")));
		};
		ws.on("message", handler);
		setTimeout(() => {
			ws.off("message", handler);
			resolve(msgs);
		}, timeoutMs);
	});
}

// ============================================================================
// Setup
// ============================================================================

let tempDir: string;
let session: AgentSession;
let httpHandle: HttpServerHandle;
const wsClients: WebSocket[] = [];

beforeEach(() => {
	tempDir = join(tmpdir(), `pi-web-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });

	const model = getModel("anthropic", "claude-sonnet-4-5")!;
	const agent = new Agent({
		getApiKey: () => "test-key",
		initialState: { model, systemPrompt: "test", tools: codingTools },
	});

	session = new AgentSession({
		agent,
		sessionManager: SessionManager.inMemory(),
		settingsManager: SettingsManager.create(tempDir, tempDir),
		cwd: tempDir,
		modelRegistry: new ModelRegistry(AuthStorage.create(join(tempDir, "auth.json")), tempDir),
		resourceLoader: createTestResourceLoader(),
	});
	session.subscribe(() => {});
});

afterEach(async () => {
	for (const ws of wsClients) ws.terminate();
	wsClients.length = 0;
	if (httpHandle) await httpHandle.close().catch(() => {});
	session.dispose();
	if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
});

// ============================================================================
// Tests
// ============================================================================

describe("Web mode integration", () => {
	test("full round-trip: get_state over WebSocket", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer();
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		wsServer.onMessage(async (client, data) => {
			if (data && typeof data === "object" && (data as Record<string, unknown>).type === "extension_ui_response") {
				core.handleExtensionUIResponse(data as any);
				return;
			}
			const resp = await core.handleCommand(data as any);
			client.send(resp);
		});

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer });
		await httpHandle.listen();

		const ws = await connectWs(port);
		wsClients.push(ws);

		const response = await sendAndReceive(ws, { id: "r1", type: "get_state" });

		expect(response.id).toBe("r1");
		expect(response.type).toBe("response");
		expect(response.command).toBe("get_state");
		expect(response.success).toBe(true);

		const data = response.data as Record<string, unknown>;
		expect(data.sessionId).toBeDefined();
		expect(data.isStreaming).toBe(false);
	});

	test("get_tools over WebSocket", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer();
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		wsServer.onMessage(async (client, data) => {
			const resp = await core.handleCommand(data as any);
			client.send(resp);
		});

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer });
		await httpHandle.listen();

		const ws = await connectWs(port);
		wsClients.push(ws);

		const response = await sendAndReceive(ws, { id: "r2", type: "get_tools" });

		expect(response.success).toBe(true);
		const data = response.data as { activeToolNames: string[]; allTools: Array<{ name: string }> };
		expect(data.activeToolNames.length).toBeGreaterThan(0);
		expect(data.allTools.length).toBeGreaterThan(0);
	});

	test("set_thinking_level over WebSocket", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer();
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		wsServer.onMessage(async (client, data) => {
			const resp = await core.handleCommand(data as any);
			client.send(resp);
		});

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer });
		await httpHandle.listen();

		const ws = await connectWs(port);
		wsClients.push(ws);

		// Set thinking level
		const resp1 = await sendAndReceive(ws, { id: "r3", type: "set_thinking_level", level: "high" });
		expect(resp1.success).toBe(true);

		// Verify
		const resp2 = await sendAndReceive(ws, { id: "r4", type: "get_state" });
		expect((resp2.data as Record<string, unknown>).thinkingLevel).toBe("high");
	});

	test("multiple clients receive broadcasts", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer();
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		wsServer.onMessage(async (client, data) => {
			const resp = await core.handleCommand(data as any);
			client.send(resp);
		});

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer });
		await httpHandle.listen();

		const ws1 = await connectWs(port);
		const ws2 = await connectWs(port);
		wsClients.push(ws1, ws2);

		// Start collecting on ws2 before sending the command
		const ws2Msgs = collectMessages(ws2, 400);

		// reload_resources emits session_changed(reload) broadcast
		ws1.send(JSON.stringify({ id: "r5", type: "reload_resources" }));

		// ws1 receives both broadcast and direct response; collect all
		const ws1Msgs = await collectMessages(ws1, 400);

		const resp = ws1Msgs.find((e) => e.type === "response");
		expect(resp).toBeDefined();
		expect(resp?.command).toBe("reload_resources");
		expect(resp?.success).toBe(true);

		// ws2 should have received the session_changed broadcast
		const ws2Results = await ws2Msgs;
		const sessionChanged = ws2Results.find((e) => e.type === "session_changed");
		expect(sessionChanged).toBeDefined();
		expect(sessionChanged?.reason).toBe("reload");
	});

	test("get_session_tree over WebSocket", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer();
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		wsServer.onMessage(async (client, data) => {
			const resp = await core.handleCommand(data as any);
			client.send(resp);
		});

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer });
		await httpHandle.listen();

		const ws = await connectWs(port);
		wsClients.push(ws);

		const response = await sendAndReceive(ws, { id: "r6", type: "get_session_tree" });

		expect(response.success).toBe(true);
		const data = response.data as { leafId: string | null; nodes: unknown[] };
		expect(data).toHaveProperty("leafId");
		expect(data).toHaveProperty("nodes");
		expect(Array.isArray(data.nodes)).toBe(true);
	});

	test("get_context_usage over WebSocket", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer();
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		wsServer.onMessage(async (client, data) => {
			const resp = await core.handleCommand(data as any);
			client.send(resp);
		});

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer });
		await httpHandle.listen();

		const ws = await connectWs(port);
		wsClients.push(ws);

		const response = await sendAndReceive(ws, { id: "r7", type: "get_context_usage" });

		expect(response.success).toBe(true);
		expect(response.data).toHaveProperty("usage");
	});

	test("token auth: rejects unauthenticated WebSocket", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer({ token: "secret" });
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer, token: "secret" });
		await httpHandle.listen();

		// Should fail without token
		await expect(connectWs(port)).rejects.toThrow();
	});

	test("token auth: accepts authenticated WebSocket", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer({ token: "secret" });
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		wsServer.onMessage(async (client, data) => {
			const resp = await core.handleCommand(data as any);
			client.send(resp);
		});

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer, token: "secret" });
		await httpHandle.listen();

		const ws = await connectWs(port, "/ws?token=secret");
		wsClients.push(ws);

		const response = await sendAndReceive(ws, { id: "r8", type: "get_state" });
		expect(response.success).toBe(true);
	});

	test("health endpoint works alongside WebSocket", async () => {
		const port = await getPort();
		const wsServer = createWebSocketServer();
		const core = createProtocolServerCore({ session, output: (obj) => wsServer.broadcast(obj) });
		await core.bind();

		httpHandle = createHttpServer({ host: "127.0.0.1", port, wsServer });
		await httpHandle.listen();

		const resp = await fetch(`http://127.0.0.1:${port}/health`);
		expect(resp.status).toBe(200);
		const data = (await resp.json()) as { status: string };
		expect(data.status).toBe("ok");
	});
});
