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

Tests use a `TestTransport` (no real backend). Each test configures its own scenario via `setupApp()` + `setHandler()` + `emitEvent()` helpers in `tests/helpers.ts`. The app detects `?test` in the URL and exposes `window.__piTestApi` for test control.

Key pattern: the real app relies on `session_changed` events to invalidate TanStack Query caches (`staleTime: Infinity`). Tests that switch/create sessions must emit `sessionChanged()` after the action to trigger cache invalidation, just like the real backend does.

### Running

```bash
# From this package directory:
npx vite build && npx playwright test           # run all tests
npx vite build && npx playwright test --update-snapshots  # regenerate baselines
PWDEBUG=1 npx vite build && npx playwright test --ui      # interactive debug (local browser)
```

### Snapshot rules

- Snapshots are rendered in Docker (consistent across OS/CI). Commit the `snapshots/` directory.
- Config uses `animations: "disabled"` to prevent flakiness from CSS animations/transitions.
- `maxDiffPixelRatio: 0.03` tolerates minor anti-aliasing differences.
