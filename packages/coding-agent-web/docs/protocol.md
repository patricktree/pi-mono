# Protocol

The frontend communicates with the coding-agent backend over WebSocket JSON messages. It uses the same protocol family as RPC mode, but only the command/event subset needed by the web UI.

## Connection

WebSocket endpoint:

```text
/ws
```

Optional token auth:

```text
ws://localhost:4781/ws?token=<token>
```

The client derives protocol + host from the current page and forwards `?token=` from the page URL.

## Request/Response Model

Commands include an optional `id`. The server echoes this in `response` events.

The web client auto-generates request IDs (`req_1`, `req_2`, ...). Requests time out after 30 seconds.

## Commands (Client → Server)

### `prompt`

Send a user prompt. Streaming events arrive asynchronously.

```json
{"id":"req_1","type":"prompt","message":"Hi"}
```

With image attachments:

```json
{
  "id": "req_2",
  "type": "prompt",
  "message": "What is in this image?",
  "images": [
    { "type": "image", "mimeType": "image/png", "data": "<base64>" }
  ]
}
```

When the agent is already streaming, set `streamingBehavior` to queue the message:

```json
{"id":"req_3","type":"prompt","message":"Focus on auth only","streamingBehavior":"steer"}
```

- `"steer"` — interweaved at the next opportunity (after current tool execution), skips remaining tool calls
- `"followUp"` — queued until the agent finishes the current run

### `abort`

Abort active agent work.

```json
{"id":"req_4","type":"abort"}
```

### `clear_queue`

Clear all queued steering and follow-up messages on the server. Returns the cleared message texts.

```json
{"id":"req_5","type":"clear_queue"}
```

### `get_state`

Fetch current session metadata.

```json
{"id":"req_4","type":"get_state"}
```

### `get_messages`

Fetch full message history for the active session.

```json
{"id":"req_5","type":"get_messages"}
```

### `list_sessions`

List sessions, default scope is `all`.

```json
{"id":"req_6","type":"list_sessions","scope":"all"}
```

### `switch_session`

Switch by session file path.

```json
{"id":"req_7","type":"switch_session","sessionPath":"/path/to/session.jsonl"}
```

### `new_session`

Create a fresh session.

```json
{"id":"req_8","type":"new_session"}
```

### `get_context_usage`

Fetch current context-window usage.

```json
{"id":"req_9","type":"get_context_usage"}
```

## Events (Server → Client)

All events are broadcast to connected web clients.

### `agent_start` / `agent_end`

Mark start/end of one agent run.

### `message_update`

Streaming deltas for assistant output.

`assistantMessageEvent.type` variants used by the frontend:

- `text_start`, `text_delta`, `text_end`
- `thinking_start`, `thinking_delta`, `thinking_end`
- `toolcall_start`, `toolcall_delta`, `toolcall_end`
- `start`, `done`, `error`

### `message_start`

Emitted when a message is added to the conversation. For user messages, this signals that a queued steering message has been interweaved into the conversation. The frontend uses this to move the message from the scheduled section into the main message timeline.

### `message_end`

Emitted when a full message object is finalized.

### `tool_execution_start` / `tool_execution_end`

Tool lifecycle events used for per-tool status indicators.

### `session_changed`

Emitted on new/switch/fork/tree/reload session transitions.

### `extension_ui_request`

UI bridge events emitted by extensions.

Frontend behavior:

- `confirm` → `window.confirm`
- `input` / `editor` / `select` → `window.prompt`
- `notify` → system message
- `set_editor_text` → system message

Responses are sent as `extension_ui_response`:

```json
{"type":"extension_ui_response","id":"...","confirmed":true}
```

```json
{"type":"extension_ui_response","id":"...","value":"..."}
```

```json
{"type":"extension_ui_response","id":"...","cancelled":true}
```

### `extension_error`

Rendered as an error message in chat.

## History Message Types

`get_messages` returns a union:

- `UserMessage`
- `AssistantMessage`
- `ToolResultMessage`

Assistant content parts include:

- `text`
- `thinking`
- `toolCall`

## Error Responses

Failed commands return `success: false` with an `error` string:

```json
{
  "type": "response",
  "command": "switch_session",
  "success": false,
  "error": "Session file not found"
}
```

The UI surfaces these as error messages.
