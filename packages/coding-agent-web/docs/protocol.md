# Protocol

The web frontend communicates with the coding-agent backend over WebSocket using JSON messages. This is the same protocol used by RPC mode (see [`coding-agent/docs/rpc.md`](../../coding-agent/docs/rpc.md)), but the web frontend uses a subset of the available commands and events.

## Connection

The WebSocket endpoint is at `/ws`. Optional token authentication is passed as a query parameter:

```text
ws://localhost:4781/ws
ws://localhost:4781/ws?token=my-secret
```

The token is extracted from the page URL's `?token=` query parameter. The WebSocket URL is derived automatically from the page's host and protocol (`ws:` for `http:`, `wss:` for `https:`).

## Request/Response

All commands include an optional `id` field for correlation. If provided, the server's response includes the same `id`. The web client auto-generates IDs (`req_1`, `req_2`, ...) for all requests.

Requests time out after 30 seconds if no response is received.

## Commands (Client → Server)

### prompt

Send a user prompt. Returns immediately; streaming events follow asynchronously.

```json
{"id": "req_1", "type": "prompt", "message": "Hello, world!"}
```

Response:

```json
{"id": "req_1", "type": "response", "command": "prompt", "success": true}
```

### abort

Abort the current agent operation.

```json
{"id": "req_2", "type": "abort"}
```

### get_state

Get current session state (session ID, name, streaming status).

```json
{"id": "req_3", "type": "get_state"}
```

Response:

```json
{
  "id": "req_3",
  "type": "response",
  "command": "get_state",
  "success": true,
  "data": {
    "sessionId": "abc123",
    "sessionName": "Refactor auth module",
    "isStreaming": false
  }
}
```

### get_messages

Get all messages in the current session.

```json
{"id": "req_4", "type": "get_messages"}
```

Response:

```json
{
  "id": "req_4",
  "type": "response",
  "command": "get_messages",
  "success": true,
  "data": {
    "messages": [
      {"role": "user", "content": "Hello", "timestamp": 1733234567890},
      {"role": "assistant", "content": [{"type": "text", "text": "Hi!"}], "timestamp": 1733234567891}
    ]
  }
}
```

### list_sessions

List available sessions. The `scope` field defaults to `"all"`.

```json
{"id": "req_5", "type": "list_sessions", "scope": "all"}
```

Response:

```json
{
  "id": "req_5",
  "type": "response",
  "command": "list_sessions",
  "success": true,
  "data": {
    "sessions": [
      {
        "path": "/home/user/.pi/agent/sessions/session1.jsonl",
        "id": "session_1",
        "cwd": "/home/user/project",
        "name": "Refactor auth module",
        "created": "2024-12-03T14:00:00.000Z",
        "modified": "2024-12-03T15:30:00.000Z",
        "messageCount": 12,
        "firstMessage": "Help me refactor the authentication module"
      }
    ]
  }
}
```

### switch_session

Switch to a different session by file path.

```json
{"id": "req_6", "type": "switch_session", "sessionPath": "/path/to/session.jsonl"}
```

### new_session

Start a fresh session.

```json
{"id": "req_7", "type": "new_session"}
```

### get_context_usage

Get current context window usage. Returns how many tokens are used out of the model's context window.

```json
{"id": "req_8", "type": "get_context_usage"}
```

Response:

```json
{
  "id": "req_8",
  "type": "response",
  "command": "get_context_usage",
  "success": true,
  "data": {
    "usage": {
      "tokens": 42000,
      "contextWindow": 200000,
      "percent": 21
    }
  }
}
```

The `usage` field is `undefined` if no usage data is available yet (e.g., before the first prompt).

## Events (Server → Client)

Events are broadcast to all connected WebSocket clients. They do not include an `id` field.

### agent_start / agent_end

Bracket the agent's processing of a prompt.

```json
{"type": "agent_start"}
{"type": "agent_end"}
```

### message_update

Streaming updates during assistant message generation. Contains the partial message and a delta event.

```json
{
  "type": "message_update",
  "message": {"role": "assistant", "content": [], "timestamp": 1733234567890},
  "assistantMessageEvent": {"type": "text_delta", "delta": "Hello "}
}
```

Delta event types used by the web frontend:

| Type              | Description                                        |
| ----------------- | -------------------------------------------------- |
| `text_start`      | Text content block started                         |
| `text_delta`      | Text content chunk                                 |
| `text_end`        | Text content block ended                           |
| `thinking_start`  | Thinking block started                             |
| `thinking_delta`  | Thinking content chunk                             |
| `thinking_end`    | Thinking block ended                               |
| `toolcall_start`  | Tool call started                                  |
| `toolcall_delta`  | Tool call arguments chunk                          |
| `toolcall_end`    | Tool call ended (includes full `toolCall` object)  |
| `start`           | Message generation started                         |
| `done`            | Message complete                                   |
| `error`           | Error occurred                                     |

### message_end

Emitted when a complete message is available (assistant or tool result).

```json
{
  "type": "message_end",
  "message": {"role": "assistant", "content": [{"type": "text", "text": "Hello!"}], "timestamp": 1733234567890}
}
```

### tool_execution_start / tool_execution_end

Bracket tool execution. The web frontend uses these to update tool step status indicators.

```json
{"type": "tool_execution_start", "toolName": "bash"}
```

```json
{
  "type": "tool_execution_end",
  "toolName": "bash",
  "result": {"content": [{"type": "text", "text": "total 48\n..."}]},
  "isError": false
}
```

### session_changed

Emitted when the session changes (new session, switch, fork, tree navigation, reload).

```json
{
  "type": "session_changed",
  "reason": "switch",
  "sessionId": "abc123",
  "sessionName": "Refactor auth module"
}
```

Reasons: `"new"`, `"switch"`, `"fork"`, `"tree"`, `"reload"`

### extension_ui_request

Extension UI requests from the backend. The web frontend handles a subset:

- **`notify`** — Displayed as a system message
- **`set_editor_text`** — Displayed as a system message ("Extension updated editor text")
- **`confirm`** — Bridged to `window.confirm()`
- **`input` / `editor` / `select`** — Bridged to `window.prompt()`

For dialog methods, the frontend sends back an `extension_ui_response`:

```json
{"type": "extension_ui_response", "id": "uuid-1", "value": "selected option"}
{"type": "extension_ui_response", "id": "uuid-2", "confirmed": true}
{"type": "extension_ui_response", "id": "uuid-3", "cancelled": true}
```

### extension_error

Extension errors are displayed as error messages.

```json
{"type": "extension_error", "error": "Provider rate limit exceeded"}
```

## Message Types

Messages returned by `get_messages` follow the same types as the RPC protocol. See [`coding-agent/docs/rpc.md`](../../coding-agent/docs/rpc.md#types) for full type definitions.

### UserMessage

```json
{
  "role": "user",
  "content": "Hello!",
  "timestamp": 1733234567890
}
```

The `content` field can be a string or an array of `TextContent` blocks.

### AssistantMessage

```json
{
  "role": "assistant",
  "content": [
    {"type": "text", "text": "Here's what I found:"},
    {"type": "thinking", "thinking": "Let me analyze..."},
    {"type": "toolCall", "id": "tc_1", "name": "read", "arguments": {"path": "README.md"}}
  ],
  "timestamp": 1733234567890
}
```

### ToolResultMessage

```json
{
  "role": "toolResult",
  "toolCallId": "tc_1",
  "toolName": "read",
  "content": [{"type": "text", "text": "file contents..."}],
  "isError": false,
  "timestamp": 1733234567890
}
```

## Error Handling

Failed commands return `success: false`:

```json
{
  "type": "response",
  "command": "switch_session",
  "success": false,
  "error": "Session file not found"
}
```

The web frontend displays these as error messages in the chat.
