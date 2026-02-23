# UI

The frontend UI is implemented in `src/App.tsx` as a React component tree styled with [Linaria](https://github.com/callstack/linaria) `css` tagged template literals and a small set of reusable primitives.

## High-level layout

```text
┌─────────────────────────────────────────┐
│ [≡] pi                        ● Status  │  Header
├─────────────────────────────────────────┤
│                                         │
│  User bubble                            │
│  └─ Collapsible steps                   │
│     ├─ thinking                         │
│     ├─ tool call + status               │
│     └─ tool result preview              │
│                                         │
│  Assistant markdown response            │
│                                         │
├─────────────────────────────────────────┤
│ Prompt textarea + context ring + send   │  Sticky footer dock
└─────────────────────────────────────────┘
```

## Component composition

- `App.tsx` — orchestration, rendering, and behavior
- `components/ui/button.tsx` — variant-based button primitive
- `components/ui/badge.tsx` — compact badge primitive
- `components/ui/textarea.tsx` — textarea primitive
- `index.css` — CSS reset + design tokens + markdown defaults

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

## Markdown rendering

Assistant content is rendered by:

1. `marked` (GitHub-flavored markdown)
2. `DOMPurify` sanitization
3. React `dangerouslySetInnerHTML`

Styling in `index.css` covers headings, lists, code blocks, tables, links, and blockquotes.

## Prompt dock behavior

The sticky prompt dock includes:

- auto-growing textarea (`max-height: 200px`)
- image attachment button + file picker
- context usage ring
- send / stop controls

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
2. resumes most recently modified session
3. hydrates message history
4. fetches context usage

Session changes (`new`, `switch`, etc.) refresh both current session metadata and session list.

## Extension UI bridge behavior

Supported extension UI request methods:

- `confirm` → browser confirm dialog
- `input`, `editor`, `select` → browser prompt dialog
- `notify`, `set_editor_text` → system messages in chat

Responses are sent back using `extension_ui_response` payloads.
