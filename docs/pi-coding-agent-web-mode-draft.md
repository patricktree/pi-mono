# Draft: `--mode web` for `packages/coding-agent`

## Goal

Add a **web mode adapter** on top of existing `AgentSession`, the same way TUI and RPC currently sit on top of it.

Key principle: keep agent execution server-side.

- `packages/agent` (`Agent`, `agent-loop`)
- `packages/coding-agent/src/core/agent-session.ts`
- sessions, tools, compaction, extensions

The browser is transport + rendering + user interaction only.

---

## Current layering (what we build on)

1. **Core engine**: `packages/agent`
   - evented loop
   - streaming deltas
   - tool execution
   - steering/follow-up queues

2. **Harness/session orchestrator**: `packages/coding-agent/src/core`
   - `AgentSession`
   - session persistence (`SessionManager`)
   - compaction/retry
   - built-in coding tools
   - extension runtime wiring

3. **Mode adapters**: `interactive`, `print`, `rpc`
   - each mode is mostly transport/presentation around `AgentSession`

`--mode web` should be a new mode adapter in the same style.

---

## Backend design

## 1) Extract shared protocol server core

Refactor `rpc-mode.ts` so command dispatch + extension-ui bridge are reusable across transports.

### Proposed files

- `packages/coding-agent/src/modes/protocol/server-core.ts`
  - command handling (`handleCommand`)
  - session event fanout
  - extension UI request/response correlation
- `packages/coding-agent/src/modes/protocol/types.ts`
  - protocol envelopes (or re-export `rpc-types.ts` initially)
- `packages/coding-agent/src/modes/protocol/extension-ui-bridge.ts`
  - `ExtensionUIContext` protocol bridge

Then thin adapters:

- `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (stdio transport only)
- `packages/coding-agent/src/modes/web/web-mode.ts` (ws/http transport)
- `packages/coding-agent/src/modes/web/http-server.ts` (serve static UI + ws endpoint)
- `packages/coding-agent/src/modes/web/ws-transport.ts` (per-client framing)

---

## 2) CLI integration

In `main.ts` + `cli/args.ts`:

- add `--mode web`
- add flags:
  - `--host <host>` default `127.0.0.1`
  - `--port <port>` default `4781`
  - `--open` open browser automatically
  - `--web-token <token>` optional auth token
  - `--serve-ui <path>` optional custom static UI build path

---

## 3) Session model in web mode

Recommended default: **single `AgentSession` per backend process**, multiple clients can attach.

Future extension: multi-session namespaces (e.g. per connection/workspace).

---

## Frontend architecture

Create a dedicated app (recommended):

- `packages/coding-agent-web/`

### Suggested structure

- `src/transport/ws-client.ts`
- `src/protocol/client.ts`
- `src/state/store.ts` (event reducer)
- `src/ui/chat/*`
- `src/ui/sessions/*`
- `src/ui/settings/*`
- `src/ui/extensions/*` (extension UI dialogs)

### Parity features to target

- streaming messages + thinking blocks + tool cards
- steer/follow-up queue controls
- model + thinking selectors
- session resume/new/fork/tree
- compaction/retry state
- extension UI protocol handling

---

## Protocol strategy

Keep current RPC protocol stable and additive.

- Reuse existing command/response format (`id`, `type: "response"`, `success`, `data`)
- Reuse event stream semantics (`AgentSessionEvent`)
- Reuse extension UI sub-protocol (`extension_ui_request`, `extension_ui_response`)

Then add explicit commands for web parity (see companion file):

- `list_sessions`
- `get_session_tree`
- `navigate_tree`
- `set_entry_label`
- `reload_resources`
- `get_context_usage`
- `get_tools`
- `set_active_tools`

---

## Extension UI compatibility in web

Implement existing extension UI methods in browser via modals/toasts/widgets:

- `select`, `confirm`, `input`, `editor`
- `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`

Respond with matching `extension_ui_response` IDs.

Limitations remain aligned with RPC mode unless expanded:

- no direct `ctx.ui.custom()` component transport
- no TUI-specific renderer APIs

---

## Security model (default-safe)

- bind `127.0.0.1` by default
- require token auth for websocket command channel
- strict origin checks unless explicitly configured
- if `--host 0.0.0.0`, print explicit warning

---

## Incremental implementation plan

### Milestone 1

- extract protocol server core from `rpc-mode.ts`
- keep `--mode rpc` behavior unchanged

### Milestone 2

- add `--mode web` + websocket transport
- minimal web UI: prompt/stream/abort/model/thinking

### Milestone 3

- add tree/session/tool/reload protocol commands
- full coding-agent workflow parity

### Milestone 4

- extension UI polish, docs, and hardening

---

## Notes on existing `packages/web-ui`

`packages/web-ui` is useful as reusable UI primitives, but it currently targets `pi-agent-core` style chat UX.

For full coding-agent parity (session tree/fork/resume, workspace tools, extension behavior), treat it as components to reuse rather than direct drop-in parity layer.
