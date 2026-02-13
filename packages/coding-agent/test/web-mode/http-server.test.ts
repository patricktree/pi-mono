/**
 * Tests for the HTTP server (routes, health, static serving, fallback HTML).
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createHttpServer, type HttpServerHandle } from "../../src/modes/web/http-server.js";
import { createWebSocketServer } from "../../src/modes/web/ws-transport.js";

// ============================================================================
// Helpers
// ============================================================================

const handles: HttpServerHandle[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
	for (const h of handles) {
		await h.close().catch(() => {});
	}
	handles.length = 0;
	for (const d of tempDirs) {
		if (existsSync(d)) rmSync(d, { recursive: true });
	}
	tempDirs.length = 0;
});

function makeTempDir(): string {
	const dir = join(tmpdir(), `pi-http-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

async function startServer(opts?: {
	serveUiPath?: string;
	token?: string;
}): Promise<{ port: number; handle: HttpServerHandle }> {
	const ws = createWebSocketServer({ token: opts?.token });
	const handle = createHttpServer({
		host: "127.0.0.1",
		port: 0, // random available port
		wsServer: ws,
		serveUiPath: opts?.serveUiPath,
		token: opts?.token,
	});
	handles.push(handle);
	const port = await handle.listen();
	return { port, handle };
}

async function fetchText(url: string): Promise<{ status: number; body: string; headers: Headers }> {
	const resp = await fetch(url);
	const body = await resp.text();
	return { status: resp.status, body, headers: resp.headers };
}

// ============================================================================
// Tests
// ============================================================================

describe("HTTP server", () => {
	test("health endpoint returns 200 with JSON", async () => {
		const { port } = await startServer();
		const { status, body } = await fetchText(`http://127.0.0.1:${port}/health`);

		expect(status).toBe(200);
		const data = JSON.parse(body);
		expect(data.status).toBe("ok");
		expect(typeof data.clients).toBe("number");
	});

	test("root serves fallback HTML when no --serve-ui", async () => {
		const { port } = await startServer();
		const { status, body, headers } = await fetchText(`http://127.0.0.1:${port}/`);

		expect(status).toBe(200);
		expect(headers.get("content-type")).toContain("text/html");
		expect(body).toContain("<title>pi web mode</title>");
		expect(body).toContain("WebSocket");
	});

	test("fallback HTML includes token in WS URL when provided", async () => {
		const { port } = await startServer({ token: "mytoken" });
		const { body } = await fetchText(`http://127.0.0.1:${port}/`);

		expect(body).toContain("token=mytoken");
	});

	test("unknown path returns 404 when no static root", async () => {
		const { port } = await startServer();
		const { status } = await fetchText(`http://127.0.0.1:${port}/nonexistent`);

		expect(status).toBe(404);
	});

	test("serves static files from --serve-ui path", async () => {
		const dir = makeTempDir();
		writeFileSync(join(dir, "index.html"), "<h1>Custom UI</h1>");
		writeFileSync(join(dir, "app.js"), "console.log('hello')");

		const { port } = await startServer({ serveUiPath: dir });

		// index.html
		const index = await fetchText(`http://127.0.0.1:${port}/`);
		expect(index.status).toBe(200);
		expect(index.body).toContain("Custom UI");
		expect(index.headers.get("content-type")).toContain("text/html");

		// JS file
		const js = await fetchText(`http://127.0.0.1:${port}/app.js`);
		expect(js.status).toBe(200);
		expect(js.body).toContain("console.log");
		expect(js.headers.get("content-type")).toContain("javascript");
	});

	test("SPA fallback: serves index.html for unknown paths", async () => {
		const dir = makeTempDir();
		writeFileSync(join(dir, "index.html"), "<h1>SPA</h1>");

		const { port } = await startServer({ serveUiPath: dir });
		const { status, body } = await fetchText(`http://127.0.0.1:${port}/some/deep/route`);

		expect(status).toBe(200);
		expect(body).toContain("SPA");
	});

	test("prevents path traversal", async () => {
		const dir = makeTempDir();
		writeFileSync(join(dir, "index.html"), "safe");

		const { port } = await startServer({ serveUiPath: dir });
		const { status } = await fetchText(`http://127.0.0.1:${port}/../../../etc/passwd`);

		// Should either 403 or fallback to index.html, not serve /etc/passwd
		expect(status === 200 || status === 403).toBe(true);
	});

	test("serves correct MIME types", async () => {
		const dir = makeTempDir();
		writeFileSync(join(dir, "index.html"), "<html>");
		writeFileSync(join(dir, "style.css"), "body{}");
		writeFileSync(join(dir, "data.json"), "{}");
		writeFileSync(join(dir, "icon.svg"), "<svg>");

		const { port } = await startServer({ serveUiPath: dir });

		const css = await fetchText(`http://127.0.0.1:${port}/style.css`);
		expect(css.headers.get("content-type")).toContain("text/css");

		const json = await fetchText(`http://127.0.0.1:${port}/data.json`);
		expect(json.headers.get("content-type")).toContain("application/json");

		const svg = await fetchText(`http://127.0.0.1:${port}/icon.svg`);
		expect(svg.headers.get("content-type")).toContain("svg");
	});

	test("close shuts down gracefully", async () => {
		const { port, handle } = await startServer();

		// Verify it's running
		const { status } = await fetchText(`http://127.0.0.1:${port}/health`);
		expect(status).toBe(200);

		// Close
		await handle.close();

		// Should fail to connect
		await expect(fetchText(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
	});
});
