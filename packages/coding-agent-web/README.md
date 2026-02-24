# @mariozechner/pi-coding-agent-web

Web frontend for `@mariozechner/pi-coding-agent --mode web`.

This package is a React + Vite app styled with [Linaria](https://github.com/callstack/linaria) (zero-runtime CSS-in-JS). It is a dedicated browser client for the coding-agent protocol server (WebSocket + RPC messages).

## Quick start

```bash
npm ci
npm run build
node packages/coding-agent/dist/cli.js --mode web --port 4781 --host 127.0.0.1
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

### Auth token

If the backend was started with `--web-token`, pass the token via query parameter:

```text
http://127.0.0.1:4781/?token=<token>
```

## Type checking and linting

```bash
npm run check
```

Runs Biome (format + lint) and TypeScript (`tsc --noEmit`).
