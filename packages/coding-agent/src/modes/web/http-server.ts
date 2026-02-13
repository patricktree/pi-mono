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
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>pi web mode</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --bg: #0d1117; --fg: #c9d1d9; --accent: #58a6ff; --border: #30363d;
           --input-bg: #161b22; --msg-user: #1c2333; --msg-ai: #161b22;
           --thinking: #8b949e; --tool: #f0883e; --error: #f85149; }
  html, body { height: 100%; background: var(--bg); color: var(--fg);
               font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
               font-size: 14px; line-height: 1.5; }
  #app { display: flex; flex-direction: column; height: 100%; max-width: 900px; margin: 0 auto; padding: 0 16px; }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  header h1 { font-size: 16px; font-weight: 600; }
  #status { font-size: 12px; padding: 2px 8px; border-radius: 12px; }
  .connected { background: #238636; color: #fff; }
  .disconnected { background: var(--error); color: #fff; }
  #messages { flex: 1; overflow-y: auto; padding: 16px 0; display: flex; flex-direction: column; gap: 12px; }
  .msg { padding: 10px 14px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; max-width: 100%; }
  .msg-user { background: var(--msg-user); border: 1px solid var(--border); }
  .msg-assistant { background: var(--msg-ai); }
  .msg-thinking { color: var(--thinking); font-style: italic; font-size: 13px; }
  .msg-tool { color: var(--tool); font-size: 13px; border-left: 3px solid var(--tool); padding-left: 12px; }
  .msg-error { color: var(--error); }
  .msg-system { color: var(--thinking); font-size: 12px; text-align: center; }
  #input-area { display: flex; gap: 8px; padding: 12px 0; border-top: 1px solid var(--border); }
  #prompt { flex: 1; background: var(--input-bg); color: var(--fg); border: 1px solid var(--border);
            border-radius: 8px; padding: 10px 14px; font-size: 14px; font-family: inherit;
            resize: none; min-height: 44px; max-height: 200px; outline: none; }
  #prompt:focus { border-color: var(--accent); }
  #prompt::placeholder { color: var(--thinking); }
  button { background: var(--accent); color: #fff; border: none; border-radius: 8px;
           padding: 10px 20px; font-size: 14px; cursor: pointer; font-weight: 500; }
  button:hover { opacity: 0.9; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  #abort-btn { background: var(--error); display: none; }
</style>
</head>
<body>
<div id="app">
  <header>
    <h1>pi</h1>
    <span id="status" class="disconnected">disconnected</span>
  </header>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="prompt" placeholder="Type a message..." rows="1"></textarea>
    <button id="send-btn">Send</button>
    <button id="abort-btn">Abort</button>
  </div>
</div>
<script>
(function() {
  var PREFIX = "[pi-web]";
  function log()  { console.log.apply(console, [PREFIX].concat(Array.prototype.slice.call(arguments))); }
  function warn() { console.warn.apply(console, [PREFIX].concat(Array.prototype.slice.call(arguments))); }
  function err()  { console.error.apply(console, [PREFIX].concat(Array.prototype.slice.call(arguments))); }

  var wsUrl = ${JSON.stringify(wsUrl)};
  log("connecting to", wsUrl);

  var ws = new WebSocket(wsUrl);
  var msgs = document.getElementById("messages");
  var prompt = document.getElementById("prompt");
  var sendBtn = document.getElementById("send-btn");
  var abortBtn = document.getElementById("abort-btn");
  var status = document.getElementById("status");
  var streaming = false;
  var currentEl = null;
  var reqId = 0;
  var msgCount = 0;

  function addMsg(cls, text) {
    var el = document.createElement("div");
    el.className = "msg " + cls;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  function setStreaming(v) {
    streaming = v;
    log("streaming:", v);
    sendBtn.style.display = v ? "none" : "";
    abortBtn.style.display = v ? "" : "none";
    prompt.disabled = v;
  }

  ws.onopen = function() {
    log("connected (readyState=" + ws.readyState + ", protocol=" + (ws.protocol || "none") + ")");
    status.textContent = "connected";
    status.className = "connected";
  };

  ws.onclose = function(e) {
    warn("disconnected code=" + e.code + " reason=" + (e.reason || "none") + " wasClean=" + e.wasClean);
    status.textContent = "disconnected";
    status.className = "disconnected";
  };

  ws.onerror = function(e) {
    err("websocket error:", e);
  };

  // Track current UI elements for incremental rendering
  var textEl = null;       // current assistant text bubble
  var thinkingEl = null;   // current thinking bubble

  ws.onmessage = function(e) {
    msgCount++;
    var data;
    try { data = JSON.parse(e.data); } catch (ex) {
      warn("recv #" + msgCount + " unparseable (" + e.data.length + " bytes):", ex.message);
      return;
    }
    var t = data.type;
    var size = e.data.length;

    // --- Logging ---
    if (t === "response") {
      log("recv #" + msgCount + " response cmd=" + data.command + " id=" + data.id + " success=" + data.success + " (" + size + "b)");
    } else if (t === "message_update") {
      var evt = data.assistantMessageEvent;
      log("recv #" + msgCount + " message_update/" + (evt ? evt.type : "?") + " (" + size + "b)");
    } else if (t === "tool_execution_start" || t === "tool_execution_end") {
      log("recv #" + msgCount + " " + t + " tool=" + data.toolName + " (" + size + "b)");
    } else {
      log("recv #" + msgCount + " " + t + " (" + size + "b)", data);
    }

    // --- Agent lifecycle ---
    if (t === "agent_start") {
      setStreaming(true);
      textEl = null;
      thinkingEl = null;
    } else if (t === "agent_end") {
      setStreaming(false);
      textEl = null;
      thinkingEl = null;

    // --- Streaming assistant message updates ---
    } else if (t === "message_update" && data.assistantMessageEvent) {
      var evt = data.assistantMessageEvent;

      if (evt.type === "text_delta") {
        // Incremental text from the assistant
        if (!textEl) {
          thinkingEl = null; // end thinking bubble when text starts
          textEl = addMsg("msg-assistant", "");
        }
        textEl.textContent += evt.delta;
        msgs.scrollTop = msgs.scrollHeight;

      } else if (evt.type === "thinking_delta") {
        // Incremental thinking content
        if (!thinkingEl) {
          thinkingEl = addMsg("msg-thinking", "");
        }
        thinkingEl.textContent += evt.delta;
        msgs.scrollTop = msgs.scrollHeight;

      } else if (evt.type === "thinking_end") {
        thinkingEl = null;

      } else if (evt.type === "text_end") {
        textEl = null;

      } else if (evt.type === "toolcall_end" && evt.toolCall) {
        textEl = null;
        thinkingEl = null;
        var inputStr = JSON.stringify(evt.toolCall.args || {});
        if (inputStr.length > 200) inputStr = inputStr.slice(0, 200) + "...";
        addMsg("msg-tool", "Tool call: " + evt.toolCall.name + "(" + inputStr + ")");
      }

    // --- Tool execution lifecycle ---
    } else if (t === "tool_execution_start") {
      textEl = null;
      thinkingEl = null;
      addMsg("msg-tool", "Running: " + data.toolName);

    } else if (t === "tool_execution_end") {
      var result = data.result;
      var preview;
      if (typeof result === "string") {
        preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
      } else {
        preview = JSON.stringify(result);
        if (preview.length > 300) preview = preview.slice(0, 300) + "...";
      }
      var cls = data.isError ? "msg-error" : "msg-tool";
      addMsg(cls, (data.isError ? "Error: " : "Result: ") + preview);

    // --- Message lifecycle (non-streaming) ---
    } else if (t === "message_end") {
      textEl = null;
      thinkingEl = null;

    // --- Responses to commands ---
    } else if (t === "response") {
      if (!data.success) {
        addMsg("msg-error", "Command error (" + data.command + "): " + (data.error || "unknown"));
      }

    // --- Session events ---
    } else if (t === "session_changed") {
      addMsg("msg-system", "Session changed (" + data.reason + ")");

    // --- Extension UI ---
    } else if (t === "extension_ui_request") {
      log("extension UI request method=" + data.method + " id=" + data.requestId);

    // --- Extension errors ---
    } else if (t === "extension_error") {
      addMsg("msg-error", "Extension error: " + (data.error || "unknown"));
    }
  };

  function send() {
    var text = prompt.value.trim();
    if (!text || streaming) return;
    var id = "req_" + (++reqId);
    log("send prompt id=" + id + " (" + text.length + " chars)");
    addMsg("msg-user", text);
    ws.send(JSON.stringify({ id: id, type: "prompt", message: text }));
    prompt.value = "";
    prompt.style.height = "auto";
  }

  sendBtn.onclick = send;
  abortBtn.onclick = function() {
    var id = "req_" + (++reqId);
    log("send abort id=" + id);
    ws.send(JSON.stringify({ id: id, type: "abort" }));
  };

  prompt.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  prompt.addEventListener("input", function() {
    prompt.style.height = "auto";
    prompt.style.height = Math.min(prompt.scrollHeight, 200) + "px";
  });

  log("client initialized, waiting for connection...");
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
