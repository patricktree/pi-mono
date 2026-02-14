# Transport

The transport layer abstracts communication between the frontend and the backend. The `Transport` interface is implemented by both `WsClient` (real WebSocket) and `MockTransport` (offline development), making the rest of the app transport-agnostic.

## Transport Interface

```typescript
interface Transport {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  onEvent(listener: EventListener): () => void;
  onStatus(listener: StatusListener): () => void;
  request(command: ClientCommand): Promise<RpcResponse>;
  sendExtensionUiResponse(response: ExtensionUiResponse): void;
}
```

| Method                               | Description                                                           |
| ------------------------------------ | --------------------------------------------------------------------- |
| `connect()`                          | Initiate connection                                                   |
| `disconnect()`                       | Close connection                                                      |
| `isConnected()`                      | Check if connection is open                                           |
| `onEvent(listener)`                  | Subscribe to server events. Returns unsubscribe function.             |
| `onStatus(listener)`                 | Subscribe to connection status changes. Returns unsubscribe function. |
| `request(command)`                   | Send a command and await the response                                 |
| `sendExtensionUiResponse(response)`  | Send an extension UI response (fire-and-forget)                       |

## WsClient

The real WebSocket transport. Handles:

- **JSON framing** — All messages are serialized/deserialized as JSON
- **Request correlation** — Each request gets a unique ID (`req_1`, `req_2`, ...). Responses are matched by ID and resolved to the correct promise.
- **Timeout** — Requests that don't receive a response within 30 seconds are rejected
- **Disconnect cleanup** — All pending requests are rejected when the connection drops
- **Status notification** — Listeners are notified on connect/disconnect

### URL Construction

The WebSocket URL is derived from the page URL:

```text
http://localhost:4781/?token=abc  →  ws://localhost:4781/ws?token=abc
https://example.com/?token=abc   →  wss://example.com/ws?token=abc
```

### Error Handling

- Non-text WebSocket frames are ignored with a warning
- Invalid JSON is ignored with a warning
- Non-object messages are ignored with a warning
- Connection errors are logged but don't throw (status listeners are notified)

## MockTransport

A mock transport for offline UI development. Instead of connecting to a real server, it replays canned event sequences with configurable timing.

Activated via the `?mock` query parameter:

| URL                        | Scenario                                          |
| -------------------------- | ------------------------------------------------- |
| `?mock` or `?mock=default` | Thinking → tool call → streamed answer            |
| `?mock=error`              | Thinking → extension error                        |
| `?mock=multi-tool`         | Three sequential tool calls → answer              |
| `?mock=long`               | Long streamed markdown response (tests scrolling) |

### How It Works

1. On `connect()`, the mock transport emits preload events (if any) and a connected status
2. If the scenario has an `autoPrompt`, replay starts immediately
3. On `request({ type: "prompt" })`, the step sequence replays with configured delays
4. On `request({ type: "abort" })`, replay is cancelled

Session management commands (`list_sessions`, `switch_session`, `new_session`, `get_state`, `get_messages`) return hardcoded mock data including three sample sessions with realistic message histories.

### Scenario Structure

```typescript
interface Scenario {
  autoPrompt?: string;       // If set, auto-plays on connect
  preload: ServerEvent[];    // Events emitted immediately on connect
  steps: ScenarioStep[];     // Timed event sequence
}

interface ScenarioStep {
  delay: number;             // Milliseconds to wait before emitting
  event: ServerEvent;        // The event to emit
}
```

Delays are relative to the previous step, not absolute. The total replay duration is the sum of all step delays.

### Adding Scenarios

New scenarios are added to the `SCENARIOS` registry in `src/mock/scenarios.ts`. Helper functions `textDeltas()` and `thinkingDeltas()` generate chunked streaming steps from a string.

## ProtocolClient

`ProtocolClient` wraps `Transport` with typed methods:

```typescript
class ProtocolClient {
  prompt(message: string): Promise<RpcResponse>;
  abort(): Promise<RpcResponse>;
  listSessions(scope?: "cwd" | "all"): Promise<SessionSummary[]>;
  switchSession(sessionPath: string): Promise<void>;
  newSession(): Promise<void>;
  getMessages(): Promise<HistoryMessage[]>;
  getState(): Promise<{ sessionId: string; sessionName?: string }>;
  sendExtensionUiResponse(response: ExtensionUiResponse): void;
}
```

Methods that return data (`listSessions`, `getMessages`, `getState`) extract the `data` field from the response and throw on `success: false`. Methods that return `RpcResponse` (`prompt`, `abort`) pass the raw response through so the caller can inspect it.
