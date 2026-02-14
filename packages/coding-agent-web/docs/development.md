# Development

## Setup

```bash
cd packages/coding-agent-web
npm install
```

## Build

```bash
npm run build
```

This produces a `dist/` directory with the static files served by the coding-agent backend.

## Running with the Backend

Build the frontend, then start the coding-agent in web mode:

```bash
npm run build
pi --mode web --serve-ui packages/coding-agent-web/dist
```

The backend auto-discovers the `dist/` directory if it's in the expected location relative to the coding-agent package. Use `--serve-ui` to override.

If you started web mode with `--web-token`, pass the token via query parameter:

```text
http://127.0.0.1:4781/?token=<token>
```

## Mock Mode

For UI development without a running backend, open the app with a `?mock` query parameter:

| URL                 | Scenario                                        |
| ------------------- | ----------------------------------------------- |
| `?mock`             | Default: thinking → tool call → streamed answer |
| `?mock=error`       | Thinking → extension error mid-stream           |
| `?mock=multi-tool`  | Three sequential tool calls → answer            |
| `?mock=long`        | Long streamed markdown (tests scrolling)        |

Mock mode replays canned event sequences with realistic timing. Session management (sidebar, switch, new session) uses hardcoded mock data. See [transport.md](transport.md) for details on the mock transport.

## Type Checking

```bash
npm run check
```

Runs Biome for linting/formatting and TypeScript for type checking.

## Project Structure

| File | Purpose |
| --- | --- |
| `index.html` | HTML shell with font imports |
| `vite.config.ts` | Vite build configuration |
| `tsconfig.json` | TypeScript config (strict, ES2022, experimental decorators for Lit) |
| `src/main.ts` | Entry point — creates and mounts `<pi-web-app>` |
| `src/ui/pi-web-app.ts` | The entire UI component (~1000 lines including CSS) |
| `src/state/store.ts` | State management (AppStore, UiMessage, event processing) |
| `src/protocol/types.ts` | Protocol type definitions |
| `src/protocol/client.ts` | Typed RPC client |
| `src/transport/transport.ts` | Transport interface |
| `src/transport/ws-client.ts` | WebSocket transport |
| `src/mock/mock-transport.ts` | Mock transport for offline development |
| `src/mock/scenarios.ts` | Canned replay scenarios |

## Dependencies

| Package      | Version  | Purpose                  |
| ------------ | -------- | ------------------------ |
| `lit`        | ^3.3.1   | Web components framework |
| `marked`     | ^15.0.12 | Markdown rendering       |
| `typescript` | ^5.7.3   | Type checking (dev)      |
| `vite`       | ^7.1.6   | Build tool (dev)         |

## TypeScript Configuration

- **`experimentalDecorators: true`** and **`useDefineForClassFields: false`** — Required for Lit's `@customElement`, `@state`, and `@query` decorators
- **`moduleResolution: bundler`** — Uses Vite's module resolution
- **`types: ["vite/client"]`** — Provides Vite-specific type augmentations

## Adding New Mock Scenarios

1. Define the scenario in `src/mock/scenarios.ts`
2. Use `textDeltas()` and `thinkingDeltas()` helpers for streaming chunks
3. Add to the `SCENARIOS` registry
4. Access via `?mock=<name>`

Example:

```typescript
const myScenario: Scenario = {
  autoPrompt: "Do something",
  preload: [],
  steps: [
    { delay: 100, event: { type: "agent_start" } },
    // ... streaming events ...
    { delay: 50, event: { type: "agent_end" } },
  ],
};

export const SCENARIOS: Record<string, Scenario> = {
  // ... existing scenarios ...
  "my-scenario": myScenario,
};
```
