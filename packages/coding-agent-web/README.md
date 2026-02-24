# @mariozechner/pi-coding-agent-web

Web frontend for Pi coding agent.

<p align="center">
  <img src="docs/screenshot-mobile.png" alt="Mobile screenshot" width="300" />
</p>

This package is a React + Vite app styled with [Linaria](https://github.com/callstack/linaria) (zero-runtime CSS-in-JS). It is a dedicated browser client for the coding-agent protocol server (WebSocket + RPC messages).

## Features

- Turn-grouped chat with streaming indicators, markdown rendering, and image attachments
- Tool call visualization with phase status (calling → running → done/error) and expandable result previews
- Prompt and shell (`!`) input modes with send/stop controls and mid-stream steering
- Thinking level selector
- Session management sidebar with create/switch and URL-synced reload persistence
- WebSocket connection with status indicator, token auth, and context usage tracking

## State model

The frontend uses a split state model:

- **TanStack Query** for server-derived state and caching (`session-state`, `sessions`, `ui-messages`, `context-usage`)
- **Zustand** for true client/UI state (`prompt`, input mode, sidebar visibility, pending images, expanded tool rows, scheduled steering messages, connection/streaming flags)

## Quick start

```bash
npm ci
npm run build
node packages/coding-agent/dist/cli.js --mode web --port 4781 --host 127.0.0.1
# Pi Web UI available on http://127.0.0.1:4781/
```

To expose it on a device in your [Tailnet](https://tailscale.com/docs/concepts/tailnet):

```bash
npm ci
npm run build
node packages/coding-agent/dist/cli.js --mode web --port 4781 --host 127.0.0.1 --web-allowed-origin https://<device-dns-name>.<tailnet-name>.ts.net:4781
tailscale serve --https 4781 http://localhost:4781
# Pi Web UI available on https://<device-dns-name>.<tailnet-name>.ts.net:4781/
```

## Development

```bash
cd packages/coding-agent-web
npm install
npm run check
```

### Dev mode with real backend

Start the coding-agent backend in one terminal:

```bash
node packages/coding-agent/dist/cli.js --mode web --port 4781 --web-allowed-origin http://localhost:5173
```

Then start Vite in another terminal:

```bash
npm run dev
```

Open `http://localhost:5173/`. The Vite dev server proxies `/ws` to the backend at `ws://127.0.0.1:4781`.

If you use a different Vite port (e.g. `npx vite --port 5199`), pass the matching origin to the backend:

```bash
node packages/coding-agent/dist/cli.js --mode web --port 4781 --web-allowed-origin http://localhost:5199
```

### Mock mode (no backend needed)

```bash
npm run dev:mock
```

This opens the browser with `?mock=default`, which replays canned events through a `TestTransport` configured by `createScenarioTransport()`.

Available mock scenarios:

| URL                        | Scenario                                             |
| -------------------------- | ---------------------------------------------------- |
| `?mock` or `?mock=default` | Thinking, tool call, streamed answer                 |
| `?mock=empty`              | Empty state, no sessions, no auto-prompt             |
| `?mock=error`              | Extension error mid-stream                           |
| `?mock=multi-tool`         | Multiple sequential tool calls                       |
| `?mock=long`               | Long streamed markdown response                      |
| `?mock=interleaved`        | Text and tool calls alternate across multiple turns  |
| `?mock=in-progress`        | Pauses mid-stream (streaming dot stays visible)      |
| `?mock=thinking`           | Agent started but no output yet (just streaming dot) |
| `?mock=steering`           | Long-running agent with a scheduled steering message |
| `?mock=tool-error`         | Mix of successful and failed tool calls              |

### Production build

```bash
npm run build
```

Outputs static assets to `dist/`. Serve them from the backend:

```bash
pi --mode web --serve-ui packages/coding-agent-web/dist
```

### URL parameters

| Parameter | Purpose                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `token`   | Auth token (required if backend was started with `--web-token`)                |
| `session` | Session ID to restore on page load (set automatically when switching sessions) |

Example:

```text
http://127.0.0.1:4781/?token=<token>&session=<session-id>
```

The `?session=` parameter is updated automatically via `history.replaceState` whenever the active session changes, so reloading the tab restores the same session.

## Type checking and linting

```bash
npm run check
```

Runs Biome (format + lint) and TypeScript (`tsc --noEmit`).
