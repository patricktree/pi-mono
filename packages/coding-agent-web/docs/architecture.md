# Architecture

The web frontend is a single-page application built with [Lit](https://lit.dev/) web components. It connects to the coding-agent's WebSocket server and provides a chat-like UI for interacting with the AI agent.

## Package Structure

```text
src/
├── main.ts                    Entry point, mounts <pi-web-app>
├── protocol/
│   ├── types.ts               Protocol type definitions (messages, events, commands)
│   └── client.ts              ProtocolClient wrapping Transport for typed RPC calls
├── transport/
│   ├── transport.ts           Transport interface (connect/disconnect/request/events)
│   └── ws-client.ts           WebSocket Transport implementation
├── mock/
│   ├── mock-transport.ts      MockTransport for offline development
│   └── scenarios.ts           Canned replay scenarios
├── state/
│   └── store.ts               AppStore — central state management
└── ui/
    └── pi-web-app.ts          Single Lit web component containing the entire UI
```

## Layers

### Transport

The `Transport` interface abstracts how the frontend communicates with the backend. Two implementations exist:

- **`WsClient`** — Real WebSocket connection to the coding-agent server. Handles JSON framing, request/response correlation via unique IDs, and reconnection awareness.
- **`MockTransport`** — Replays canned event sequences for offline UI development. Activated via `?mock` query parameter.

Both implement the same interface, so the rest of the app is transport-agnostic.

### Protocol

`ProtocolClient` provides typed methods (`prompt()`, `abort()`, `listSessions()`, etc.) on top of `Transport`. It handles request/response patterns and error extraction so the UI layer doesn't deal with raw JSON.

The protocol types in `types.ts` mirror the server-side RPC types. The web client uses a subset of the full protocol — see [protocol.md](protocol.md) for the commands and events supported by the web frontend.

### State

`AppStore` is a simple publish/subscribe store that holds the `AppState`:

```typescript
interface AppState {
  connected: boolean;
  streaming: boolean;
  messages: UiMessage[];
  sessions: SessionSummary[];
  currentSessionId: string | null;
  sidebarOpen: boolean;
  contextUsage: ContextUsage | undefined;
}
```

The store converts raw server events into `UiMessage` objects grouped by kind (`user`, `assistant`, `thinking`, `tool`, `error`, `system`). Tool steps track their lifecycle phase (`calling` → `running` → `done`/`error`).

State updates are immutable — each change produces a new state object and notifies all subscribers.

### UI

The entire UI lives in a single Lit web component (`<pi-web-app>`). It subscribes to `AppStore` and re-renders on state changes. The component handles:

- Connection lifecycle and session auto-resume
- Message display with turn-based grouping
- Streaming text with progress indicators
- Tool step rendering with collapsible detail
- Markdown rendering via [marked](https://github.com/markedjs/marked)
- Session sidebar (list, switch, create)
- Prompt input with keyboard handling

## Data Flow

```text
User input
  │
  ▼
<pi-web-app> ─── ProtocolClient ─── Transport (WsClient) ─── WebSocket
  │                                        │
  ▼                                        │
AppStore ◄──── handleServerEvent() ◄───────┘
  │                                    (streaming events)
  ▼
<pi-web-app> re-renders
```

1. User types a prompt and hits Enter (or taps Send)
2. `<pi-web-app>` calls `protocolClient.prompt(message)`
3. `WsClient` sends JSON over WebSocket
4. Server streams events back (`agent_start`, `message_update`, `tool_execution_*`, `agent_end`)
5. `AppStore.handleServerEvent()` converts events into UI state
6. `<pi-web-app>` re-renders via Lit's reactive update cycle

## Backend Integration

The web frontend connects to the coding-agent's web mode server (`pi --mode web`). The backend uses the `AgentSession` SDK directly — incoming WebSocket commands are mapped to session method calls without an intermediate protocol abstraction layer. See [`coding-agent/docs/web-mode.md`](../../coding-agent/docs/web-mode.md) for full documentation of the server-side components, including the HTTP server, WebSocket transport, authentication, origin checking, and extension UI bridge.

Key source files in `packages/coding-agent/src/modes/web/`:

- [`web-mode.ts`](../../coding-agent/src/modes/web/web-mode.ts) — Entry point, command handling via direct `AgentSession` SDK calls, event forwarding
- [`http-server.ts`](../../coding-agent/src/modes/web/http-server.ts) — HTTP server, serves static files from this package's `dist/` directory
- [`ws-transport.ts`](../../coding-agent/src/modes/web/ws-transport.ts) — WebSocket server with token auth and origin allowlist

The backend auto-discovers this package's `dist/` directory relative to its own installation path. Use `--serve-ui <path>` to override.
