# Transport

The transport layer isolates frontend/backend communication behind a single interface, so higher layers do not care whether events come from a real WebSocket or a mock replay source.

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

## `WsClient` (real backend transport)

`WsClient` implements:

- JSON framing/parsing
- request/response correlation by request ID
- 30s per-request timeout
- listener fan-out for events and connection status
- pending request rejection on disconnect

### Request correlation

Every command gets an ID (`req_1`, `req_2`, ...). When a matching `response` arrives, the pending promise resolves.

### Error handling

- invalid JSON frames are ignored with warnings
- non-object/non-text frames are ignored
- connection drops reject all pending requests

## `TestTransport` (test and offline UI transport)

`TestTransport` is a single `Transport` implementation used for both automated tests and visual dev mode (`?mock` query parameter).

It provides:

- **Instant or async connect** — `connect()` for tests, `connectAsync(delayMs)` for visual dev
- **Configurable request handlers** — per-command-type handlers via `handleRequest(type, fn)`
- **Request recording** — all `request()` calls captured for test assertions
- **Synchronous event emission** — `emitEvent()` / `emitEvents()` for tests
- **Timed replay** — `replayWithTiming(steps)` for scenario playback with delays

### Visual dev mode

The factory function `createScenarioTransport(scenario, logger)` in `src/mock/create-scenario-transport.ts` configures a `TestTransport` with:

- Mock session data (session list, per-session message history)
- `prompt` handler that triggers timed scenario replay
- `abort` handler that cancels replay
- Async connect with a short delay to simulate WebSocket handshake

Built-in scenarios:

- `default`
- `empty`
- `error`
- `multi-tool`
- `long`
- `interleaved`
- `in-progress`
- `thinking`
- `steering`
- `tool-error`

## Scenario Model

```typescript
interface Scenario {
  autoPrompt?: string;
  autoSteeringPrompt?: string;
  preload: ServerEvent[];
  steps: ScenarioStep[];
  emptySessions?: boolean;
}

interface ScenarioStep {
  delay: number;
  event: ServerEvent;
}
```

- `autoPrompt` — if set, the scenario auto-plays on connect with this as the user message.
- `autoSteeringPrompt` — if set, a scheduled steering message is added while the agent is running.
- `emptySessions` — if true, the mock transport returns an empty session list (fresh state).
- `delay` is relative to the previous step.

## Protocol Client Wrapper

`ProtocolClient` wraps `Transport` with typed methods:

```typescript
class ProtocolClient {
  prompt(message: string, options?: {
    images?: ImageContent[];
    streamingBehavior?: "steer" | "followUp";
  }): Promise<RpcResponse>;
  abort(): Promise<RpcResponse>;
  clearQueue(): Promise<RpcResponse>;
  bash(command: string): Promise<BashResult>;
  abortBash(): Promise<void>;
  listSessions(scope?: "cwd" | "all"): Promise<SessionSummary[]>;
  switchSession(sessionPath: string): Promise<void>;
  newSession(): Promise<void>;
  getMessages(): Promise<HistoryMessage[]>;
  getState(): Promise<{ sessionId: string; sessionName?: string; thinkingLevel?: ThinkingLevel }>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
  getContextUsage(): Promise<ContextUsage | undefined>;
  sendExtensionUiResponse(response: ExtensionUiResponse): void;
}
```

It centralizes:

- command payload shape
- response success/error checks
- typed extraction of response `data`

This keeps React UI code focused on rendering and user interaction, not protocol plumbing.
