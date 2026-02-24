# Development

## Setup

```bash
cd packages/coding-agent-web
npm install
```

## Dev mode with real backend

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

## Mock mode (no backend needed)

```bash
npm run dev:mock
```

Opens the browser with `?mock=default`, which replays canned events through a `TestTransport` configured by `createScenarioTransport()`.

| URL | Scenario |
| --- | --- |
| `?mock` or `?mock=default` | Thinking, tool call, streamed answer |
| `?mock=error` | Extension error mid-stream |
| `?mock=multi-tool` | Multiple sequential tool calls |
| `?mock=long` | Long streamed markdown response |
| `?mock=steering` | Long-running agent with a scheduled steering message |

## Build

```bash
npm run build
```

Outputs static assets to `dist/`.

## Run with the Backend

Build frontend assets, then run coding-agent in web mode:

```bash
npm run build
pi --mode web --serve-ui packages/coding-agent-web/dist
```

If web mode was started with `--web-token`, include it in the URL:

```text
http://127.0.0.1:4781/?token=<token>
```

## Type Checking and Linting

```bash
npm run check
```

Runs Biome and TypeScript (`tsc --noEmit`).

## Project Structure

| File | Purpose |
| --- | --- |
| `index.html` | HTML shell and font imports |
| `vite.config.ts` | Vite config (React SWC + Linaria/wyw-in-js plugin, WS proxy) |
| `tsconfig.json` | Strict TS config, React JSX, alias paths |
| `src/main.tsx` | React entrypoint |
| `src/App.tsx` | Root app component |
| `src/index.css` | CSS reset, design tokens, markdown/base styles |
| `src/components/ui/*` | Reusable UI primitives |
| `src/lib/utils.ts` | `cx()` re-export from `@linaria/core` |
| `src/state/store.ts` | AppStore and event-to-state mapping |
| `src/protocol/types.ts` | Shared protocol types |
| `src/protocol/client.ts` | Typed protocol client |
| `src/transport/transport.ts` | Transport interface |
| `src/transport/ws-client.ts` | WebSocket transport |
| `src/mock/create-scenario-transport.ts` | Factory for visual dev mock transport |
| `src/transport/test-transport.ts` | Test/mock transport implementation |
| `src/mock/scenarios.ts` | Mock scenario definitions |

## Main Dependencies

| Package | Purpose |
| --- | --- |
| `react`, `react-dom` | UI runtime |
| `vite`, `@vitejs/plugin-react-swc` | Build/dev server |
| `@linaria/core`, `@wyw-in-js/vite` | Zero-runtime CSS-in-JS (build-time extraction) |
| `@radix-ui/react-slot` | Primitive composition |
| `lucide-react` | Icons |
| `marked`, `dompurify` | Markdown rendering + sanitization |

## TypeScript Notes

- `jsx: "react-jsx"` is enabled.
- `moduleResolution: "bundler"` is used for Vite-style imports.
- `@/*` alias maps to `src/*`.

## Adding New Mock Scenarios

1. Add the scenario to `src/mock/scenarios.ts`
2. Register it in `SCENARIOS`
3. Open `?mock=<name>`

Example skeleton:

```typescript
const myScenario: Scenario = {
  autoPrompt: "Do something",
  preload: [],
  steps: [
    { delay: 100, event: { type: "agent_start" } },
    { delay: 50, event: { type: "agent_end" } },
  ],
};

export const SCENARIOS: Record<string, Scenario> = {
  // existing scenarios...
  "my-scenario": myScenario,
};
```
