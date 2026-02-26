/**
 * Tests for the WebSocket transport layer (using `ws` library clients).
 */

import * as http from "node:http";
import * as net from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import WebSocket from "ws";
import { createWebSocketServer, type WebSocketServer } from "../../src/modes/web/ws-transport.js";

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

/**
 * Create a minimal HTTP server that delegates upgrades to the WS server.
 */
function createTestServer(ws: WebSocketServer): http.Server {
	const server = http.createServer((_req, res) => {
		res.writeHead(200);
		res.end("ok");
	});
	server.on("upgrade", (req, socket, head) => {
		ws.handleUpgrade(req, socket, head);
	});
	return server;
}

function listen(server: http.Server, port: number): Promise<void> {
	return new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}

function close(server: http.Server): Promise<void> {
	return new Promise((resolve) => server.close(() => resolve()));
}

/** Connect a ws client, resolves once open */
function connectClient(port: number, path = "/", headers: Record<string, string> = {}): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
		ws.on("open", () => resolve(ws));
		ws.on("error", reject);
	});
}

/** Read a single JSON message from a ws client */
function readOne(ws: WebSocket): Promise<unknown> {
	return new Promise((resolve) => {
		ws.once("message", (data) => {
			resolve(JSON.parse(data.toString("utf8")));
		});
	});
}

// ============================================================================
// Tests
// ============================================================================

const servers: http.Server[] = [];
const wsClients: WebSocket[] = [];

afterEach(async () => {
	for (const ws of wsClients) {
		ws.terminate();
	}
	wsClients.length = 0;
	for (const s of servers) {
		if (typeof s.closeAllConnections === "function") {
			s.closeAllConnections();
		}
		await Promise.race([close(s), new Promise<void>((r) => setTimeout(r, 500))]).catch(() => {});
	}
	servers.length = 0;
});

describe("WebSocket transport", () => {
	test("accepts upgrade and assigns client id", async () => {
		const port = await getPort();
		const wss = createWebSocketServer();
		const server = createTestServer(wss);
		servers.push(server);
		await listen(server, port);

		let connectedId: string | undefined;
		wss.onMessage((client) => {
			connectedId = client.id;
		});

		const ws = await connectClient(port);
		wsClients.push(ws);
		ws.send(JSON.stringify({ ping: true }));

		await new Promise((r) => setTimeout(r, 50));

		expect(connectedId).toBeDefined();
		expect(typeof connectedId).toBe("string");
		expect(wss.clientCount()).toBe(1);
	});

	test("receives and parses JSON messages", async () => {
		const port = await getPort();
		const wss = createWebSocketServer();
		const server = createTestServer(wss);
		servers.push(server);
		await listen(server, port);

		const received: unknown[] = [];
		wss.onMessage((_client, data) => {
			received.push(data);
		});

		const ws = await connectClient(port);
		wsClients.push(ws);
		ws.send(JSON.stringify({ type: "prompt", message: "hello" }));

		await new Promise((r) => setTimeout(r, 50));

		expect(received).toHaveLength(1);
		expect(received[0]).toEqual({ type: "prompt", message: "hello" });
	});

	test("sends JSON to client", async () => {
		const port = await getPort();
		const wss = createWebSocketServer();
		const server = createTestServer(wss);
		servers.push(server);
		await listen(server, port);

		wss.onMessage((client) => {
			client.send({ type: "response", data: "ok" });
		});

		const ws = await connectClient(port);
		wsClients.push(ws);

		const responsePromise = readOne(ws);
		ws.send(JSON.stringify({ type: "ping" }));

		const parsed = await responsePromise;
		expect(parsed).toEqual({ type: "response", data: "ok" });
	});

	test("broadcasts to all connected clients", async () => {
		const port = await getPort();
		const wss = createWebSocketServer();
		const server = createTestServer(wss);
		servers.push(server);
		await listen(server, port);

		const ws1 = await connectClient(port);
		const ws2 = await connectClient(port);
		wsClients.push(ws1, ws2);
		await new Promise((r) => setTimeout(r, 50));

		expect(wss.clientCount()).toBe(2);

		const p1 = readOne(ws1);
		const p2 = readOne(ws2);

		wss.broadcast({ type: "event", msg: "hello all" });

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toEqual({ type: "event", msg: "hello all" });
		expect(r2).toEqual({ type: "event", msg: "hello all" });
	});

	test("fires close handler when client disconnects", async () => {
		const port = await getPort();
		const wss = createWebSocketServer();
		const server = createTestServer(wss);
		servers.push(server);
		await listen(server, port);

		const closedPromise = new Promise<string>((resolve) => {
			wss.onClose((client) => {
				resolve(client.id);
			});
		});

		let clientId: string | undefined;
		wss.onMessage((client) => {
			clientId = client.id;
		});

		const ws = await connectClient(port);
		ws.send(JSON.stringify({ ping: true }));
		await new Promise((r) => setTimeout(r, 50));

		ws.close(1000, "bye");

		const closedId = await closedPromise;
		expect(closedId).toBe(clientId);
	});

	test("rejects upgrade without Sec-WebSocket-Key", async () => {
		const port = await getPort();
		const wss = createWebSocketServer();
		const server = createTestServer(wss);
		servers.push(server);
		await listen(server, port);

		// Use a raw TCP socket without the key header
		const socket = net.connect(port, "127.0.0.1", () => {
			socket.write(
				"GET / HTTP/1.1\r\n" +
					"Host: localhost\r\n" +
					"Upgrade: websocket\r\n" +
					"Connection: Upgrade\r\n" +
					"\r\n",
			);
		});

		const response = await new Promise<string>((resolve) => {
			socket.once("data", (data) => resolve(data.toString()));
		});

		expect(response).toContain("400");
		socket.destroy();
	});

	test("origin check: rejects disallowed origin", async () => {
		const port = await getPort();
		const wss = createWebSocketServer({ allowedOrigins: ["http://localhost:3000"] });
		const server = createTestServer(wss);
		servers.push(server);
		await listen(server, port);

		await expect(connectClient(port, "/", { Origin: "http://evil.com" })).rejects.toThrow();
	});

	test("closeAll: terminates all connections", async () => {
		const port = await getPort();
		const wss = createWebSocketServer();
		const server = createTestServer(wss);
		servers.push(server);
		await listen(server, port);

		const ws1 = await connectClient(port);
		const ws2 = await connectClient(port);
		wsClients.push(ws1, ws2);
		await new Promise((r) => setTimeout(r, 50));
		expect(wss.clientCount()).toBe(2);

		wss.closeAll();
		await new Promise((r) => setTimeout(r, 100));
		expect(wss.clientCount()).toBe(0);
	});
});
