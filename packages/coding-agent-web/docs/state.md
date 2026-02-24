# State Management

State is managed by `AppStore` (`src/state/store.ts`) using an immutable publish/subscribe model.

React subscribes to `AppStore` in `App.tsx` and mirrors store snapshots into component state for rendering.

## AppState

```typescript
interface AppState {
  connected: boolean;
  streaming: boolean;
  messages: UiMessage[];
  scheduledMessages: UiMessage[];
  sessions: SessionSummary[];
  currentSessionId: string | null;
  sidebarOpen: boolean;
  contextUsage: ContextUsage | undefined;
  thinkingLevel: ThinkingLevel | undefined;
}
```

`scheduledMessages` holds steering messages that have been sent to the server but not yet interweaved into the conversation. These are displayed in a separate section between the message timeline and the prompt input.

## UI Message Model

Backend message/event shapes are normalized into `UiMessage` objects:

```typescript
interface UiMessage {
  id: string;
  kind: "user" | "assistant" | "thinking" | "tool" | "error" | "system" | "bash";
  text: string;
  toolStep?: ToolStepData;
  bashResult?: BashResultData;
  images?: ImageContent[];
}

interface BashResultData {
  command: string;
  output: string;
  exitCode: number | undefined;
}
```

### Message kinds

| Kind | Meaning |
| --- | --- |
| `user` | Prompt entered by the user |
| `assistant` | Final assistant response text |
| `thinking` | Reasoning stream blocks |
| `tool` | Tool invocation with status/result preview |
| `bash` | User-initiated shell command result (via shell mode or `!` prefix) |
| `error` | Command/extension/backend errors |
| `system` | System/extension notifications |

## Tool Step Lifecycle

Tool messages can carry structured status in `toolStep`:

```typescript
interface ToolStepData {
  toolName: string;
  toolArgs: string;
  phase: "calling" | "running" | "done" | "error";
  result?: string;
}
```

Phase flow:

1. `calling` — tool call detected (`toolcall_end`)
2. `running` — execution started (`tool_execution_start`)
3. `done` or `error` — execution ended (`tool_execution_end`)

## Event Processing

`AppStore.handleServerEvent()` applies server events to state.

| Event | Effect |
| --- | --- |
| `agent_start` | `streaming = true`, reset active stream pointers |
| `agent_end` | `streaming = false`, reset active stream pointers |
| `message_start` (user) | Move matching scheduled message from `scheduledMessages` to `messages` |
| `message_update:text_delta` | Append to active assistant text message |
| `message_update:thinking_delta` | Append to active thinking message |
| `message_update:toolcall_end` | Create a new tool step message |
| `tool_execution_start` | Mark active tool step as `running` |
| `tool_execution_end` | Mark active tool step as `done/error` and attach result preview |
| `response` with `success: false` | Add error message |
| `extension_ui_request` | Add system message for supported methods |
| `extension_error` | Add error message |

## History Hydration

`loadMessagesFromHistory()` converts `get_messages` history into `UiMessage[]`.

Tool results are matched back to their originating tool call via `toolCallId`, so restored history shows correct tool status and previews.

## Turn Grouping

The store keeps a flat timeline (`messages`).

`App.tsx` derives turn grouping at render time:

- each `user` message starts a new turn
- following messages belong to that turn until next user message

This keeps store logic simple while allowing rich UI grouping.

## Steering and Scheduled Messages

When the user sends a message while the agent is streaming, it is dispatched as a steering message (`streamingBehavior: "steer"`) and added to `scheduledMessages`. When the server interweaves it into the conversation (signaled by `message_start` with a user message), the store moves the matching entry from `scheduledMessages` to `messages`.

`clearScheduledMessages()` removes all scheduled messages and returns them. This is used by the dequeue action, which restores the message text into the prompt input and sends `clear_queue` to the server.

## React-local UI State

Some transient UI state is intentionally kept in React component state (not `AppStore`), for example:

- current prompt input text
- collapsed tool-turn IDs
- pending image attachments

`AppStore` remains focused on shared session/event state.
