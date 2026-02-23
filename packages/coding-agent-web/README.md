# @mariozechner/pi-coding-agent-web

Web frontend for `@mariozechner/pi-coding-agent --mode web`.

This package is a React + Vite app styled with Tailwind CSS and shadcn/ui components. It is a dedicated browser client for the coding-agent protocol server (WebSocket + RPC messages).

## Development

```bash
cd packages/coding-agent-web
npm install
npm run check
```

To run it locally:

```bash
npx vite --host 127.0.0.1 --port 4173
```

For UI-only testing with canned events, open:

```text
http://127.0.0.1:4173/?mock=default
```

To serve the production build from the coding-agent backend:

```bash
pi --mode web --serve-ui packages/coding-agent-web/dist
```

If you started web mode with `--web-token`, pass the token via query parameter:

```text
http://127.0.0.1:4781/?token=<token>
```
