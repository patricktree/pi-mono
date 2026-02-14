# State Management

The `AppStore` class manages all UI state via an immutable publish/subscribe pattern. Components subscribe to state changes and re-render when the state updates.

## AppState

```typescript
interface AppState {
  connected: boolean;          // WebSocket connection status
  streaming: boolean;          // Whether the agent is currently processing
  messages: UiMessage[];       // All messages in the current session
  sessions: SessionSummary[];  // Available sessions (sorted by modified date, newest first)
  currentSessionId: string | null;  // Active session ID
  sidebarOpen: boolean;        // Whether the session sidebar is open
}
```

## UiMessage

Server messages are converted to `UiMessage` objects for display:

```typescript
interface UiMessage {
  id: string;           // Unique ID (e.g., "msg_1")
  kind: UiMessageKind;  // "user" | "assistant" | "thinking" | "tool" | "error" | "system"
  text: string;         // Display text (markdown for assistant, plain for others)
  toolStep?: ToolStepData;  // Present only when kind === "tool"
}
```

### Message Kinds

| Kind | Source | Display |
| --- | --- | --- |
| `user` | User prompts | Plain text in a rounded card |
| `assistant` | LLM text responses | Rendered as markdown |
| `thinking` | LLM reasoning blocks | Italic, muted text |
| `tool` | Tool calls and results | Tool name, args, status, and result preview |
| `error` | Failed commands, extension errors | Red text |
| `system` | Extension notifications, editor updates | Small muted text |

### Tool Step Lifecycle

Tool messages track their execution phase:

```typescript
interface ToolStepData {
  toolName: string;
  toolArgs: string;
  phase: "calling" | "running" | "done" | "error";
  result?: string;  // Preview text, set when phase is "done" or "error"
}
```

Phase transitions:

1. **`calling`** — `toolcall_end` event received. Tool call is known but not yet executing.
2. **`running`** — `tool_execution_start` event received. Tool is executing.
3. **`done`** — `tool_execution_end` event received with `isError: false`.
4. **`error`** — `tool_execution_end` event received with `isError: true`.

## Subscribing to State

```typescript
const store = new AppStore();

const unsubscribe = store.subscribe((state) => {
  // Called immediately with current state, then on every update
  console.log(state.messages.length, "messages");
});

// Later:
unsubscribe();
```

The Lit component subscribes in `connectedCallback()` and assigns the state to a `@state()` property, which triggers Lit's reactive update cycle.

## Event Processing

`AppStore.handleServerEvent()` converts server events into state updates:

| Server Event                          | State Change                                                            |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `agent_start`                         | `streaming = true`, reset active message tracking                       |
| `agent_end`                           | `streaming = false`, reset active message tracking                      |
| `message_update` (text_delta)         | Append delta to current assistant message (create if needed)            |
| `message_update` (thinking_delta)     | Append delta to current thinking message (create if needed)             |
| `message_update` (toolcall_end)       | Create a new tool step message                                          |
| `message_end`                         | Reset active text/thinking message tracking                             |
| `tool_execution_start`                | Set active tool step phase to `"running"`                               |
| `tool_execution_end`                  | Set active tool step phase to `"done"` or `"error"` with result preview |
| `response` (failed)                   | Add error message                                                       |
| `extension_ui_request` (notify)       | Add system message                                                      |
| `extension_error`                     | Add error message                                                       |
| `session_changed`                     | Handled by UI component (triggers session refresh)                      |

### Streaming Text Assembly

During streaming, the store tracks the active text and thinking message IDs. Text deltas are appended to the current message. When a `text_end` or `thinking_end` event arrives, the active ID is cleared so the next delta starts a new message.

This means multiple text/thinking blocks within a single assistant turn become separate `UiMessage` objects.

### History Loading

When switching sessions or on initial connect, `loadMessagesFromHistory()` converts the full message history (from `get_messages`) into `UiMessage` objects. Tool results are matched to their corresponding tool call messages via `toolCallId` to set the correct phase and result preview.

## Turn Grouping

Messages are grouped into turns for display. Each user message starts a new turn, and all subsequent messages (thinking, tool, assistant, error, system) belong to that turn until the next user message.

```typescript
interface Turn {
  user: UiMessage;    // The user prompt
  steps: UiMessage[]; // All response messages in this turn
}
```

Turn grouping is computed at render time by `groupTurns()`, not stored in state. Messages that appear before any user message are treated as orphans and rendered separately.
