# UI

The entire frontend is a single Lit web component (`<pi-web-app>`) defined in `src/ui/pi-web-app.ts`. It subscribes to `AppStore` and re-renders on every state change.

## Layout

```text
┌─────────────────────────────────────────┐
│ [≡]  pi                    ● Connected  │  ← Header
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ User message                    │    │  ← Turn
│  └─────────────────────────────────┘    │
│  ▸ 3 steps                              │  ← Collapsible tool steps
│    ├ thinking (italic, muted)           │
│    ├ read("README.md") ✓ Done           │  ← Tool step with status
│    └ bash("ls") ✓ Done                  │
│                                         │
│  Assistant response with **markdown**   │  ← Rendered markdown
│                                         │
│                                 ← scroll │  ← Scrollable message area
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Type a message...                   │ │  ← Prompt input
│ │                          ◔  [Send] │ │  ← Context ring + send button
│ └─────────────────────────────────────┘ │  ← Prompt dock (sticky bottom)
└─────────────────────────────────────────┘
```

### Sidebar (Session List)

The sidebar slides in from the left when the hamburger button is clicked:

```text
┌──────────┬──────────────────────────────┐
│ pi       │                              │
│          │  (backdrop overlay)          │
│ [+ New]  │                              │
│          │                              │
│ ● Auth   │                              │
│   refac. │                              │
│   ~/proj │                              │
│   12 msg │                              │
│          │                              │
│   CI fix │                              │
│   ~/proj │                              │
│   8 msg  │                              │
└──────────┴──────────────────────────────┘
```

Sessions are sorted by last modified date (newest first). The active session is highlighted. Clicking a session switches to it and loads its message history.

## Turn-Based Grouping

Messages are grouped into turns for display. Each user message starts a new turn containing all subsequent assistant responses, tool steps, thinking blocks, errors, and system messages until the next user message.

Within a turn:

1. **User message** — Displayed in a rounded card with a muted background
2. **Tool steps** — Collapsible section showing thinking blocks and tool invocations
3. **Error messages** — Red text (from failed commands or extension errors)
4. **Assistant text** — Rendered as markdown with full formatting support
5. **System messages** — Small muted text (extension notifications)

### Collapsible Steps

Tool steps and thinking blocks are grouped under a collapsible toggle ("3 steps"). The toggle shows/hides the step details. Steps are rendered inside a left-bordered container.

## Streaming Indicators

During streaming:

- A blinking blue dot appears after the last assistant text (or as "Thinking●" if no text yet)
- Tool steps show animated status icons:
  - `···` — Calling (tool call received, not yet executing)
  - Spinning circle — Running
  - Green checkmark — Done
  - Red X — Error

## Markdown Rendering

Assistant messages are rendered as HTML via [marked](https://github.com/markedjs/marked) with GFM (GitHub Flavored Markdown) enabled. Supported elements:

- Headings (h1–h6)
- Bold, italic, strikethrough
- Inline code and fenced code blocks
- Ordered and unordered lists
- Links (underlined, blue)
- Blockquotes
- Horizontal rules
- Tables

Code blocks use the `IBM Plex Mono` font. No syntax highlighting is applied.

## Context Usage Indicator

A small circular progress ring in the prompt toolbar shows how much of the model's context window has been consumed. It appears to the left of the Send button once usage data is available.

- **Color**: Grey by default, shifts to orange at ≥50% usage and red at ≥80%
- **Tooltip**: Hovering reveals a tooltip with the exact token count and percentage (e.g., "42k / 200k tokens (21%)")
- **Refresh**: The indicator is fetched on initial connect and after every agent turn completes (`agent_end` event)
- **Hidden**: The ring is hidden until the first `get_context_usage` response arrives

## Prompt Input

The prompt area is a `<textarea>` that auto-resizes up to 200px height. Keyboard behavior:

| Key         | Desktop        | Mobile (touch) |
| ----------- | -------------- | -------------- |
| Enter       | Send message   | Insert newline |
| Shift+Enter | Insert newline | Insert newline |
| Send button | Send message   | Send message   |

On touch devices (`ontouchstart` in window or `maxTouchPoints > 0`), Enter always inserts a newline to accommodate on-screen keyboards. Users tap the Send button instead.

During streaming, the prompt is disabled and a "Stop" button replaces the Send button.

## Session Auto-Resume

On initial connection:

1. Fetch current state (`get_state`) and session list (`list_sessions`) in parallel
2. Find the most recently modified session
3. If it differs from the current session, switch to it
4. Load the session's message history (`get_messages`)

This ensures the web UI resumes where the user left off.

## Extension UI Bridging

The web frontend bridges extension UI requests from the backend to browser-native dialogs:

| Extension Method              | Browser Implementation        |
| ----------------------------- | ----------------------------- |
| `confirm`                     | `window.confirm()`            |
| `input` / `editor` / `select` | `window.prompt()`             |
| `notify`                      | Displayed as a system message |
| `set_editor_text`             | Displayed as a system message |

Responses are sent back via `sendExtensionUiResponse()`. Cancellation (closing the dialog) sends `{ cancelled: true }`.

## Responsive Design

The layout adapts to narrow screens (< 600px):

- Content padding reduces from 24px to 16px
- Turn gaps reduce from 32px to 24px
- Sidebar width is capped at 85vw
