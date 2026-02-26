# coding-agent-web

## E2E Tests (Playwright)

This package has Playwright E2E tests in `tests/` with visual snapshot baselines in `snapshots/`.

### When to run

After **any** change to UI components, state logic, styles, or the protocol client:

1. Build + run tests: `npx vite build && npx playwright test`
2. If a screenshot assertion fails due to an **intentional** visual change, update baselines: `npx vite build && npx playwright test --update-snapshots`
3. Visually inspect updated snapshots before committing them (use the read tool on the .png files).

### When to add/update tests

- **New UI feature or component**: add behavioral assertions + at least one `toHaveScreenshot()` call capturing the new visual state.
- **Bug fix that changes visible behavior**: add a test reproducing the bug, verify it fails before the fix and passes after.
- **Changed RPC/event handling**: update or add tests in the relevant spec file to cover the new protocol flow.

### Test architecture

Tests use a real WebSocket connection. Each test spins up a `TestWsServer` (Node.js `ws` server on port 0) that acts as a fake backend. The app connects to it via the `?ws=` query param override in `getWebSocketUrl()`. This exercises the full transport layer (`WsClient`, JSON serialization, WebSocket lifecycle) — no in-process mocks, no `window.__piTestApi`.

Key patterns:

- `setupApp()` creates a server, registers default handlers, navigates the page, and waits for "Connected". Returns the server instance.
- `server.setStaticHandler(type, response)` — register a canned RPC response.
- `server.emitEvent(event)` / `server.emitEvents([...])` — push server events to the client.
- `afterEach` must call `server.close()` to terminate connections and free the port.
- The real app relies on `session_changed` events to invalidate TanStack Query caches (`staleTime: Infinity`). Tests that switch/create sessions must call `server.emitEvent(sessionChanged(...))` after the action to trigger cache invalidation, just like the real backend does.

### Running

```bash
# From this package directory:
npx vite build && npx playwright test                     # run all tests
npx vite build && npx playwright test --update-snapshots  # regenerate baselines
PWDEBUG=1 npx vite build && npx playwright test --ui      # interactive debug (local browser)
```

### Snapshot rules

- Snapshots are rendered in Docker (consistent across OS/CI). Commit the `snapshots/` directory.
- Config uses `animations: "disabled"` to prevent flakiness from CSS animations/transitions.
- `maxDiffPixelRatio: 0.03` tolerates minor anti-aliasing differences.
