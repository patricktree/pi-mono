# Web Mode

Web mode starts an HTTP + WebSocket server for browser-based agent interaction. It reuses the shared protocol server core (same command handling as RPC mode) but transports over WebSocket instead of stdio.

The browser frontend lives in a separate package: [`@mariozechner/pi-coding-agent-web`](../../coding-agent-web/).

**Source files:**

- [`src/modes/web/web-mode.ts`](../src/modes/web/web-mode.ts) — Entry point and orchestration
- [`src/modes/web/http-server.ts`](../src/modes/web/http-server.ts) — HTTP server and static file serving
- [`src/modes/web/ws-transport.ts`](../src/modes/web/ws-transport.ts) — WebSocket server with auth and origin checks
- [`src/modes/protocol/server-core.ts`](../src/modes/protocol/server-core.ts) — Shared command dispatcher (same as RPC mode)
- [`src/modes/protocol/extension-ui-bridge.ts`](../src/modes/protocol/extension-ui-bridge.ts) — Extension UI request/response bridge

## Starting Web Mode

```bash
pi --mode web [options]
```

| Option | Default | Description |
| --- | --- | --- |
| `--web-host <host>` | `127.0.0.1` | Bind address |
| `--web-port <port>` | `4781` | Listen port |
| `--web-open` | off | Open browser automatically |
| `--web-token <token>` | none | Require token authentication |
| `--web-allowed-origins <origins>` | auto | Extra allowed origins for WebSocket CORS |
| `--serve-ui <path>` | auto-detected | Path to static UI build directory |

## Server Architecture

```text
Browser (coding-agent-web)
    │
    ├── HTTP GET / ──────────────── http-server.ts ──── static files (dist/)
    ├── HTTP GET /health ────────── http-server.ts ──── JSON health check
    │
    └── WebSocket /ws?token=... ─── ws-transport.ts
                                        │
                                    web-mode.ts (message routing)
                                        │
                                ┌───────┴───────┐
                                │               │
                        extension_ui_response   RpcCommand
                                │               │
                    extension-ui-bridge.ts   server-core.ts
                                                │
                                          AgentSession
                                                │
                                        (agent loop, tools, LLM)
                                                │
                                          server-core.ts (event subscription)
                                                │
                                          ws-transport.ts (broadcast)
                                                │
                                        Browser ← streaming events
```

## HTTP Server

`createHttpServer()` creates a Node.js `http.Server` with three route handlers:

### Routes

**`GET /health`** — Health check endpoint. Returns JSON with connected client count:

```json
{"status": "ok", "clients": 2}
```

**`GET /ws` (upgrade)** — WebSocket upgrade requests are delegated to the WebSocket server. Non-`/ws` upgrade requests are rejected with 404.

**`GET /*`** — Static file serving. Behavior depends on whether `--serve-ui` is configured:

- **With `--serve-ui`**: Serves files from the specified directory. Includes SPA fallback (serves `index.html` for paths that don't match a file). Path traversal is blocked.
- **Without `--serve-ui`**: Serves a built-in fallback HTML page at `/` that shows setup instructions and tests WebSocket connectivity.

### UI Path Resolution

If `--serve-ui` is not specified, the server auto-discovers the frontend build:

1. `<coding-agent-package>/../../coding-agent-web/dist` (monorepo sibling)
2. `<coding-agent-package>/../web-ui` (legacy path)

If neither exists, the fallback HTML page is served instead.

### MIME Types

The server maps file extensions to content types for common web assets: `.html`, `.js`, `.mjs`, `.css`, `.json`, `.png`, `.jpg`, `.svg`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.map`.

Unknown extensions are served as `application/octet-stream`.

## WebSocket Server

`createWebSocketServer()` wraps the `ws` library in a higher-level API with per-client abstraction, authentication, and origin checking.

### Authentication

If a token is configured (`--web-token`), the server validates the `?token=` query parameter on WebSocket upgrade requests. Invalid tokens receive a `401 Unauthorized` response and the connection is rejected before the WebSocket handshake completes.

### Origin Checking

When binding to `127.0.0.1` or `localhost`, the server automatically allows origins matching the bound address:

- `http://127.0.0.1:<port>`
- `http://localhost:<port>`
- `http://<host>:<port>`

Additional origins can be added via `--web-allowed-origins`. When binding to `0.0.0.0`, no origin restrictions are applied by default (any origin is accepted).

Connections from disallowed origins receive a `403 Forbidden` response.

### Client Abstraction

Each WebSocket connection is wrapped in a `WebSocketClient`:

```typescript
interface WebSocketClient {
  id: string;                               // crypto.randomUUID()
  send(data: object): void;                 // JSON.stringify and send
  close(code?: number, reason?: string): void;
  isOpen(): boolean;
}
```

### Message Flow

1. **Incoming**: Raw WebSocket frames are parsed as JSON. The `type` field is logged. Parsed messages are dispatched to all registered message handlers.
2. **Outgoing (unicast)**: Command responses are sent only to the requesting client via `client.send()`.
3. **Outgoing (broadcast)**: Agent events (streaming updates, tool execution, session changes) are broadcast to all connected clients via `wsServer.broadcast()`.

### Logging

All WebSocket activity is logged to stderr with timestamps:

- Connection/disconnection with client ID, remote address, origin, and client count
- Each received message with client ID, command type, and byte count
- Each broadcast with event type, recipient count, and byte count
- Errors, pings, and rejected connections

## Protocol Server Core

The shared `ProtocolServerCore` handles command dispatch. It is reused by both RPC mode (stdio) and web mode (WebSocket). See [rpc.md](rpc.md) for the full list of commands and events.

### Message Routing in Web Mode

`web-mode.ts` routes incoming WebSocket messages:

1. If `type === "extension_ui_response"` → forwarded to the extension UI bridge
2. Otherwise → treated as an `RpcCommand` and dispatched to `core.handleCommand()`

Command responses are sent back to the requesting client only. Agent events are broadcast to all clients via the `output` callback wired to `wsServer.broadcast()`.

### Shutdown

If an extension requests shutdown (via `ctx.shutdown()`), the server:

1. Emits `session_shutdown` to all extensions
2. Closes the HTTP server (which also closes all WebSocket connections)
3. Exits the process

## Extension UI Bridge

Extensions can request user interaction via `ctx.ui.select()`, `ctx.ui.confirm()`, etc. In web mode, these are serialized as `extension_ui_request` events broadcast to all clients. The frontend bridges them to browser-native dialogs and sends back `extension_ui_response` messages.

The bridge supports two categories:

**Dialog methods** (require a response):

| Method | Request Fields | Expected Response |
| --- | --- | --- |
| `select` | `title`, `options`, `timeout` | `{ value: string }` or `{ cancelled: true }` |
| `confirm` | `title`, `message`, `timeout` | `{ confirmed: boolean }` or `{ cancelled: true }` |
| `input` | `title`, `placeholder`, `timeout` | `{ value: string }` or `{ cancelled: true }` |
| `editor` | `title`, `prefill` | `{ value: string }` or `{ cancelled: true }` |

**Fire-and-forget methods** (no response expected):

| Method | Request Fields | Purpose |
| --- | --- | --- |
| `notify` | `message`, `notifyType` | Display a notification |
| `setStatus` | `statusKey`, `statusText` | Set/clear status bar entry |
| `setWidget` | `widgetKey`, `widgetLines`, `widgetPlacement` | Set/clear widget content |
| `setTitle` | `title` | Set window/tab title |
| `set_editor_text` | `text` | Set editor input text |

Each dialog request gets a UUID. If the request includes a `timeout`, the bridge auto-resolves with a default value when the timeout expires. Abort signals are also supported for cancellation.

### Unsupported Methods

Some `ExtensionUIContext` methods are not supported in web/protocol mode:

- `custom()` → returns `undefined`
- `setWorkingMessage()`, `setFooter()`, `setHeader()`, `setEditorComponent()` → no-ops
- `getEditorText()` → returns `""`
- `getToolsExpanded()` → returns `false`
- `pasteToEditor()` → delegates to `setEditorText()`
- `getAllThemes()` → returns `[]`
- `getTheme()` → returns `undefined`
- `setTheme()` → returns `{ success: false, error: "..." }`

## Security Considerations

- **Token auth**: Use `--web-token` to require authentication. Without it, anyone who can reach the server can control the agent.
- **Bind address**: The default `127.0.0.1` only accepts local connections. Binding to `0.0.0.0` exposes the server to the network — the server prints a warning.
- **Origin checking**: Prevents cross-site WebSocket hijacking when bound to localhost.
- **Path traversal**: Static file serving resolves and validates paths to prevent directory traversal attacks.
- **No HTTPS**: The built-in server is HTTP only. For production use behind a network, place it behind a reverse proxy with TLS termination.
