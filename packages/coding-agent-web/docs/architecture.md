# Architecture

The web frontend is a single-page application built with React, Vite, and [Linaria](https://github.com/callstack/linaria) (zero-runtime CSS-in-JS). It connects to the coding-agent WebSocket server and provides a chat-like interface for agent interaction.

## Package Structure

```text
src/
├── main.tsx                  Entry point, mounts <App />
├── App.tsx                   Root React component (layout + orchestration)
├── index.css                 CSS reset, design tokens, markdown/base styles
├── components/
│   ├── ScheduledMessages.tsx Scheduled steering messages section
│   └── ui/
│       ├── badge.tsx         UI primitive
│       ├── button.tsx        UI primitive (variant classes)
│       └── textarea.tsx      UI primitive
├── lib/
│   └── utils.ts              cx() re-export from @linaria/core
├── protocol/
│   ├── types.ts              Protocol type definitions (commands, events, messages)
│   └── client.ts             ProtocolClient with typed RPC methods
├── transport/
│   ├── transport.ts          Transport interface
│   └── ws-client.ts          WebSocket transport implementation
├── mock/
│   ├── create-scenario-transport.ts  Factory for visual dev mock transport
│   └── scenarios.ts                  Canned replay scenarios
└── state/
    └── store.ts              AppStore (immutable pub/sub state)
```

## Layers

### Transport

`Transport` abstracts backend communication. Two implementations exist:

- **`WsClient`** — real WebSocket transport, request/response correlation, timeouts, status callbacks.
- **`TestTransport`** — configurable transport for automated tests and visual dev. Supports instant or async connect, per-command request handlers, request recording, synchronous event emission, and timed scenario replay.

The `createScenarioTransport()` factory in `src/mock/create-scenario-transport.ts` configures a `TestTransport` with mock session data and scenario replay for visual dev mode.

Everything above this layer is transport-agnostic.

### Protocol

`ProtocolClient` provides typed methods such as `prompt()`, `abort()`, `listSessions()`, `switchSession()`, and `getContextUsage()`. It wraps `Transport` so UI code doesn’t handle raw JSON directly.

Protocol types in `src/protocol/types.ts` mirror the server event/command schema used by web/RPC modes.

### State

`AppStore` holds canonical application state:

- connection and streaming status
- message timeline
- session list + current session
- sidebar visibility
- context usage

State updates are immutable. The UI subscribes to store updates and re-renders from the latest snapshot.

### UI

`App.tsx` is the root UI orchestrator. It handles:

- transport initialization and lifecycle
- backend event handling
- session auto-resume and switching
- turn grouping and rendering
- prompt input, keyboard handling, and image attachments
- markdown rendering (`marked`) with sanitization (`DOMPurify`)
- responsive layout and interaction states

The UI is composed from Linaria `css` tagged template literals (scoped class names extracted at build time) plus a small set of reusable primitives in `src/components/ui`.

## Data Flow

```text
User input
  │
  ▼
React UI (App.tsx) ─── ProtocolClient ─── Transport (WsClient) ─── WebSocket
  │                                           │
  ▼                                           │
AppStore ◄──────────── handleServerEvent() ◄──┘
  │                                     (streaming events)
  ▼
React re-render from store state
```

1. User submits a prompt in the React UI
2. `ProtocolClient` sends a typed command via `Transport`
3. Backend streams events (`agent_start`, `message_update`, `tool_execution_*`, `agent_end`)
4. `AppStore` converts events into `UiMessage` state
5. React re-renders from updated state

## Backend Integration

The frontend targets coding-agent web mode (`pi --mode web`).

Relevant backend source files (`packages/coding-agent/src/modes/web/`):

- `web-mode.ts` — command handling and event broadcasting
- `http-server.ts` — static asset serving
- `ws-transport.ts` — WebSocket server, auth, and origin checks

The backend can auto-discover this package’s `dist/` folder, or it can be passed explicitly via `--serve-ui`.
