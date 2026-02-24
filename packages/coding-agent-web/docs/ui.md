# UI

The frontend UI is implemented in `src/App.tsx` as a React component tree styled with [Linaria](https://github.com/callstack/linaria) `css` tagged template literals and a small set of reusable primitives.

## High-level layout

```text
┌─────────────────────────────────────────┐
│ [≡] pi                        ● Status │  Header
├─────────────────────────────────────────┤
│ Session title (first user message)     │  SessionTitleBar
├─────────────────────────────────────────┤  (only when session
│                                        │   has content)
│  User bubble                           │
│  └─ Steps                              │
│     ├─ tool call + status              │
│     └─ tool result preview             │
│                                        │
│  Assistant markdown response           │
│                                        │
├─────────────────────────────────────────┤
│ ⏱ Scheduled        ↩ Restore to editor │  Scheduled messages
│   Dimmed user bubble                   │  (only visible when
│                                        │   steering messages
│                                        │   are queued)
├─────────────────────────────────────────┤
│ Prompt textarea + send/stop            │  Sticky footer dock
│ [thinking ▾]              [⌨] [💬]     │  Bottom toolbar
└─────────────────────────────────────────┘
```

## Component composition

- `App.tsx` — root orchestrator (transport lifecycle, event handling, layout)
- `components/Header.tsx` — top bar with sidebar toggle and connection status pill
- `components/SessionTitleBar.tsx` — sticky bar below header showing the first user message as title
- `components/Sidebar.tsx` — slide-in session list with logo, cwd, new-session button
- `components/MessageList.tsx` — turn-grouped message rendering with streaming dots
- `components/UserBubble.tsx` — right-aligned user message bubble with optional image thumbnails
- `components/ToolStep.tsx` — tool call status (calling/running/done/error) with expandable result preview
- `components/Markdown.tsx` — `marked` + `DOMPurify` markdown renderer
- `components/EmptyState.tsx` — placeholder for new sessions (shows cwd)
- `components/PromptInput.tsx` — auto-growing textarea, image attachments, send/stop buttons
- `components/BottomToolbar.tsx` — thinking-level dropdown selector + prompt/shell mode toggle
- `components/ScheduledMessages.tsx` — queued steering messages with dequeue action
- `components/TabBar.tsx` — session/changes tab switcher
- `components/ChangesPanel.tsx` — session changes panel (placeholder)
- `components/ui/button.tsx` — variant-based button primitive
- `components/ui/badge.tsx` — compact badge primitive
- `components/ui/textarea.tsx` — textarea primitive
- `styles/globalStyles.ts` — CSS reset, design tokens, base styles (Linaria `:global()`)
- `utils/helpers.ts` — logging, turn grouping, URL/file helpers, shared CSS classes

## Sidebar (sessions)

A slide-in left sidebar contains:

- new-session action
- session list sorted by modification time
- current session highlight
- per-session metadata (cwd, message count, relative age)

The sidebar is controlled through app state and closed by selecting a session or clicking the backdrop.

## Message rendering model

Messages are shown in turns:

1. User message bubble
2. Optional collapsible tool/thinking steps
3. Error/system messages
4. Assistant markdown output

The latest active turn shows streaming indicators while generation is in progress.

## Tool step UI

Tool calls render with structured status:

- `calling` (ellipsis)
- `running` (spinner)
- `done` (check)
- `error` (x)

For completed/error states, a truncated result preview is shown.

## Session title bar

When the session has content, a `SessionTitleBar` appears between the header and the message list. It displays the text of the first user message as a session title (truncated with ellipsis if too long).

## Markdown rendering

Assistant content is rendered by the `Markdown` component:

1. `marked` (GitHub-flavored markdown)
2. `DOMPurify` sanitization
3. React `dangerouslySetInnerHTML`

Markdown styles (headings, lists, code blocks, tables, links, blockquotes) are scoped inside the `Markdown` component via a Linaria `css` block.

## Scheduled messages section

When the user sends a message while the agent is streaming, it is queued as a steering message. These appear in a dedicated `ScheduledMessages` section between the message timeline and the prompt input:

- Dimmed user bubbles with a "⏱ Scheduled" label
- A "↩ Restore to editor" button that dequeues all scheduled messages, clears them from the server queue, and puts their text back into the prompt input

When the server interweaves a steering message, it is moved from this section into the main message timeline.

## Thinking level selector

The bottom toolbar includes a thinking-level dropdown on the left side. It controls how much reasoning the LLM performs per turn.

Available levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`. Each level shows a short description (e.g. "Deep reasoning (~16k tokens)"). The selector sends a `set_thinking_level` command to the server and optimistically updates the UI.

## Input mode (prompt / shell)

The prompt dock supports two modes, toggled via the bottom toolbar:

- **Prompt mode** — sends messages to the agent. Shows image attachment (+) and send buttons. Placeholder: "Ask anything...".
- **Shell mode** — executes bash commands directly on the server. Placeholder: "Enter shell command...".

The toolbar below the input shows two toggle buttons on the right: a terminal icon (shell mode) and a message icon (prompt mode). The active mode button is highlighted.

Typing `!` at the start of the input auto-switches to shell mode. Removing the `!` prefix switches back to prompt mode. Submitting with a `!` prefix in prompt mode also executes as a bash command (matching the TUI `!command` behavior).

Shell output is displayed as a monospace `bash` message with the command and output. Non-zero exit codes are rendered inline.

## Prompt dock behavior

The sticky prompt dock includes:

- auto-growing textarea (`max-height: 200px`)
- image attachment button + file picker (prompt mode only)
- send / stop controls

The prompt input and attachment button remain enabled while the agent is streaming. Messages sent during streaming are dispatched as steering messages. Both the send button and the stop button are visible during streaming.

Keyboard behavior:

- desktop: `Enter` sends, `Shift+Enter` inserts newline
- touch devices: `Enter` inserts newline; send via button

## Image attachments

- accepts `image/*`
- validates max size (20 MB per file)
- previews pending thumbnails
- supports removing individual pending images
- sends base64 image payloads with prompt command

## Connection and session UX

On connect, the app:

1. fetches current state + sessions
2. restores the session specified in the `?session=<id>` URL parameter (if present and valid), otherwise resumes the most recently modified session
3. hydrates message history
4. fetches context usage

The current session ID is synced to the URL as a `?session=` query parameter via `history.replaceState`. This means reloading the browser tab restores the same session. Switching sessions, creating new sessions, and server-side session changes all update the URL automatically.

Session changes (`new`, `switch`, etc.) refresh both current session metadata and session list.

## Extension UI bridge behavior

Supported extension UI request methods:

- `confirm` → browser confirm dialog
- `input`, `editor`, `select` → browser prompt dialog
- `notify`, `set_editor_text` → system messages in chat

Responses are sent back using `extension_ui_response` payloads.
