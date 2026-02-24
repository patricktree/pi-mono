# State Management

State is split by ownership:

- **TanStack Query** for server-derived state and caching
- **Zustand** for true client/UI state

`App.tsx` composes both sources and computes view-only values during render (turn grouping, session title, latest user message).

## Server State (TanStack Query)

The app uses query keys for backend data:

- `session-state` → `get_state`
- `sessions` → `list_sessions`
- `ui-messages:<sessionId>` → `get_messages` + streaming event updates
- `context-usage:<sessionId>` → `get_context_usage`

`ui-messages` stores normalized `UiMessage[]` (not raw protocol history).

## Client State (Zustand)

`useAppStore` in `src/state/store.ts` holds only non-server state:

```typescript
interface AppState {
  connected: boolean;
  streaming: boolean;
  scheduledMessages: UiMessage[];
  sidebarOpen: boolean;
  prompt: string;
  inputMode: "prompt" | "shell";
  pendingImages: ImageContent[];
  expandedTools: Set<string>;
}
```

### Why these are in Zustand

- They are local interaction state, not authoritative backend resources.
- They must update immediately from user actions and transport status.
- They do not need query cache semantics (staleness, refetch, invalidation).

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

interface ToolStepData {
  toolName: string;
  toolArgs: string;
  phase: "calling" | "running" | "done" | "error";
  result?: string;
}

interface BashResultData {
  command: string;
  output: string;
  exitCode: number | undefined;
}
```

## MessageController

`MessageController` is a message-domain reducer/helper used by `App.tsx`.

Responsibilities:

- `loadMessagesFromHistory(history)` converts `get_messages` history into `UiMessage[]`
- `handleServerEvent(messages, event)` applies streaming events to current messages
- `createUserMessage`, `createErrorMessage`, `createBashResultMessage` create local UI messages
- tracks active streaming pointers for text/thinking/tool-step updates

This keeps message transformation logic centralized while leaving persistence/caching to TanStack Query.

## Event Processing

Event handling is coordinated in `App.tsx`:

1. transport receives a `ServerEvent`
2. local UI flags update in Zustand (`streaming` on `agent_start/agent_end`)
3. scheduled steering messages are interwoven on `message_start`
4. current session's `ui-messages` query cache is updated via:
   `queryClient.setQueryData(uiMessagesKey, current => messageController.handleServerEvent(current, event))`

### Special handling: scheduled steering messages

When the user sends a prompt while streaming:

- message is added to `scheduledMessages` (Zustand)
- RPC request uses `streamingBehavior: "steer"`
- on matching user `message_start`, the item is removed from `scheduledMessages` and appended to `ui-messages`

`clearScheduledMessages()` supports "Restore to editor" by returning and clearing all scheduled items.

## History Hydration

On initial load and session switch:

- app fetches `get_messages`
- converts history via `MessageController.loadMessagesFromHistory()`
- stores result in `ui-messages` query cache

Tool results are matched back to their originating tool call via `toolCallId`, so restored history shows correct tool status and previews.

## Render-time Derivations

The app computes derived presentation state during render (not stored):

- `groupTurns(messages)` → `{ orphans, turns }`
- `lastUserMessage(messages)`
- `deriveSessionTitle(messages)`

This keeps the canonical state minimal and avoids duplicating derived data.
