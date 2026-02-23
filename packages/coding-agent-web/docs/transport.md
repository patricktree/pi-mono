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

## `MockTransport` (offline UI transport)

Used via `?mock` query parameters. It simulates server behavior by replaying scenario events with delays.

Built-in scenarios:

- `default`
- `error`
- `multi-tool`
- `long`

It also returns mock data for RPC-style commands (`list_sessions`, `get_messages`, `get_state`, etc.) so the full UI can be exercised without a backend.

## Scenario Model

```typescript
interface Scenario {
  autoPrompt?: string;
  preload: ServerEvent[];
  steps: ScenarioStep[];
}

interface ScenarioStep {
  delay: number;
  event: ServerEvent;
}
```

`delay` is relative to the previous step.

## Protocol Client Wrapper

`ProtocolClient` wraps `Transport` with typed methods:

```typescript
class ProtocolClient {
  prompt(message: string, images?: ImageContent[]): Promise<RpcResponse>;
  abort(): Promise<RpcResponse>;
  listSessions(scope?: "cwd" | "all"): Promise<SessionSummary[]>;
  switchSession(sessionPath: string): Promise<void>;
  newSession(): Promise<void>;
  getMessages(): Promise<HistoryMessage[]>;
  getState(): Promise<{ sessionId: string; sessionName?: string }>;
  getContextUsage(): Promise<ContextUsage | undefined>;
  sendExtensionUiResponse(response: ExtensionUiResponse): void;
}
```

It centralizes:

- command payload shape
- response success/error checks
- typed extraction of response `data`

This keeps React UI code focused on rendering and user interaction, not protocol plumbing.
