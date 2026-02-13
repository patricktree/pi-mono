/**
 * HTTP server for web mode.
 *
 * Serves:
 * - Static UI files from a configurable directory (or built-in fallback)
 * - WebSocket endpoint at /ws for the protocol
 * - Health-check endpoint at /health
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import * as http from "node:http";
import { extname, join, resolve } from "node:path";
import type { WebSocketServer } from "./ws-transport.js";

// ============================================================================
// Logging
// ============================================================================

function log(msg: string): void {
	const ts = new Date().toISOString();
	console.error(`[http ${ts}] ${msg}`);
}

// ============================================================================
// Types
// ============================================================================

export interface HttpServerOptions {
	host: string;
	port: number;
	/** Path to static UI build directory. If undefined, serves a built-in fallback page. */
	serveUiPath?: string;
	/** WebSocket server to delegate upgrades to */
	wsServer: WebSocketServer;
	/** Optional auth token – validated by wsServer, but also checked for /health */
	token?: string;
}

// ============================================================================
// MIME types
// ============================================================================

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".map": "application/json",
};

// ============================================================================
// Built-in fallback HTML (shown when no --serve-ui is provided)
// ============================================================================

function getFallbackHtml(host: string, port: number, token?: string): string {
	const wsUrl = `ws://${host === "0.0.0.0" ? "localhost" : host}:${port}/ws${token ? `?token=${token}` : ""}`;
	const uiUrl = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}${token ? `/?token=${encodeURIComponent(token)}` : ""}`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>pi web mode</title>
<style>
  html, body {
    height: 100%;
    margin: 0;
    background: #0d1117;
    color: #c9d1d9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 32px 20px;
  }
  h1 { margin: 0 0 8px; font-size: 22px; }
  p { margin: 0 0 12px; line-height: 1.5; color: #8b949e; }
  code {
    display: block;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 6px 0 12px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .ok { color: #3fb950; }
  .warn { color: #f0883e; }
</style>
</head>
<body>
<main>
  <h1>pi web mode</h1>
  <p>
    No external web UI bundle is configured. The production frontend now lives in
    <strong>packages/coding-agent-web</strong>.
  </p>
  <p>Build and serve it with:</p>
  <code>npm run build --prefix packages/coding-agent-web
pi --mode web --serve-ui packages/coding-agent-web/dist</code>
  <p>Current WebSocket endpoint:</p>
  <code>${wsUrl}</code>
  <p>Current UI URL:</p>
  <code>${uiUrl}</code>
  <p id="status" class="warn">Checking WebSocket connectivity…</p>
</main>
<script>
(function() {
  var ws = new WebSocket(${JSON.stringify(wsUrl)});
  var status = document.getElementById("status");
  ws.onopen = function() {
    status.textContent = "WebSocket reachable";
    status.className = "ok";
    ws.close();
  };
  ws.onerror = function() {
    status.textContent = "WebSocket error";
    status.className = "warn";
  };
  ws.onclose = function(event) {
    if (event.code !== 1000) {
      status.textContent = "WebSocket closed (" + event.code + ")";
      status.className = "warn";
    }
  };
})();
</script>
</body>
</html>`;
}

// ============================================================================
// Server factory
// ============================================================================

export interface HttpServerHandle {
	/** The underlying http.Server */
	server: http.Server;
	/** Start listening. Returns the actual port bound. */
	listen(): Promise<number>;
	/** Gracefully shut down */
	close(): Promise<void>;
}

export function createHttpServer(options: HttpServerOptions): HttpServerHandle {
	const { host, port, serveUiPath, wsServer, token } = options;
	const staticRoot = serveUiPath ? resolve(serveUiPath) : undefined;

	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		const pathname = url.pathname;

		// Health endpoint
		if (pathname === "/health") {
			log(`${req.method} ${pathname} -> 200 (clients: ${wsServer.clientCount()})`);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ status: "ok", clients: wsServer.clientCount() }));
			return;
		}

		// Static file serving
		if (staticRoot) {
			log(`${req.method} ${pathname} -> static (root: ${staticRoot})`);
			serveStatic(staticRoot, pathname, res);
			return;
		}

		// Fallback HTML
		if (pathname === "/" || pathname === "/index.html") {
			log(`${req.method} ${pathname} -> 200 fallback HTML`);
			const html = getFallbackHtml(host, port, token);
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(html);
			return;
		}

		log(`${req.method} ${pathname} -> 404`);
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not Found");
	});

	// WebSocket upgrade
	server.on("upgrade", (req, socket, head) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		if (url.pathname === "/ws") {
			log(`upgrade ${url.pathname} (origin: ${req.headers.origin ?? "none"})`);
			wsServer.handleUpgrade(req, socket, head);
		} else {
			log(`upgrade rejected: path ${url.pathname} != /ws`);
			socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
			socket.end();
		}
	});

	return {
		server,
		listen() {
			return new Promise<number>((resolve, reject) => {
				server.once("error", (err) => {
					log(`listen error: ${err.message}`);
					reject(err);
				});
				server.listen(port, host, () => {
					const addr = server.address();
					const boundPort = typeof addr === "object" && addr ? addr.port : port;
					log(`listening on ${host}:${boundPort}${staticRoot ? ` (static: ${staticRoot})` : " (fallback UI)"}`);
					resolve(boundPort);
				});
			});
		},
		close() {
			log("shutting down");
			return new Promise<void>((resolve) => {
				wsServer.closeAll();
				server.close(() => {
					log("shut down");
					resolve();
				});
			});
		},
	};
}

// ============================================================================
// Static file helper
// ============================================================================

function serveStatic(root: string, pathname: string, res: http.ServerResponse): void {
	// Normalise and prevent path traversal
	let filePath = join(root, pathname === "/" ? "index.html" : pathname);
	filePath = resolve(filePath);
	if (!filePath.startsWith(root)) {
		log(`static ${pathname} -> 403 path traversal blocked`);
		res.writeHead(403, { "Content-Type": "text/plain" });
		res.end("Forbidden");
		return;
	}

	if (!existsSync(filePath)) {
		// SPA fallback: serve index.html for non-file paths
		const indexPath = join(root, "index.html");
		if (existsSync(indexPath)) {
			log(`static ${pathname} -> 200 SPA fallback`);
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			createReadStream(indexPath).pipe(res);
			return;
		}
		log(`static ${pathname} -> 404`);
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not Found");
		return;
	}

	const stat = statSync(filePath);
	if (stat.isDirectory()) {
		const indexPath = join(filePath, "index.html");
		if (existsSync(indexPath)) {
			log(`static ${pathname} -> 200 dir index`);
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			createReadStream(indexPath).pipe(res);
			return;
		}
		log(`static ${pathname} -> 404 dir no index`);
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not Found");
		return;
	}

	const ext = extname(filePath).toLowerCase();
	const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
	log(`static ${pathname} -> 200 ${contentType}`);
	res.writeHead(200, { "Content-Type": contentType });
	createReadStream(filePath).pipe(res);
}
