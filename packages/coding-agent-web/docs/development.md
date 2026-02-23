# Development

## Setup

```bash
cd packages/coding-agent-web
npm install
```

## Local Development

```bash
npm run dev
```

Starts a Vite dev server.

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

## Mock Mode

For UI development without a running backend, append a `mock` query param:

| URL | Scenario |
| --- | --- |
| `?mock` | Default: thinking → tool call → streamed answer |
| `?mock=error` | Thinking → extension error mid-stream |
| `?mock=multi-tool` | Multiple sequential tool calls |
| `?mock=long` | Long streamed markdown response |

Mock mode replays event sequences through `MockTransport` and uses hardcoded session data.

## Type Checking and Linting

```bash
npm run check
```

Runs Biome and TypeScript (`tsc --noEmit`).

## Project Structure

| File | Purpose |
| --- | --- |
| `index.html` | HTML shell and font imports |
| `vite.config.ts` | Vite config (React SWC + Tailwind plugin) |
| `tsconfig.json` | Strict TS config, React JSX, alias paths |
| `components.json` | shadcn/ui-style alias + Tailwind config metadata |
| `src/main.tsx` | React entrypoint |
| `src/App.tsx` | Root app component |
| `src/index.css` | Tailwind + CSS variables + markdown/base styles |
| `src/components/ui/*` | Reusable UI primitives |
| `src/lib/utils.ts` | `cn()` helper |
| `src/state/store.ts` | AppStore and event-to-state mapping |
| `src/protocol/types.ts` | Shared protocol types |
| `src/protocol/client.ts` | Typed protocol client |
| `src/transport/transport.ts` | Transport interface |
| `src/transport/ws-client.ts` | WebSocket transport |
| `src/mock/mock-transport.ts` | Mock transport |
| `src/mock/scenarios.ts` | Mock scenario definitions |

## Main Dependencies

| Package | Purpose |
| --- | --- |
| `react`, `react-dom` | UI runtime |
| `vite`, `@vitejs/plugin-react-swc` | Build/dev server |
| `tailwindcss`, `@tailwindcss/vite` | Styling |
| `@radix-ui/react-slot` | Primitive composition |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Class composition and variants |
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
