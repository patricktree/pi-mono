# @mariozechner/pi-coding-agent-web

Web frontend for `@mariozechner/pi-coding-agent --mode web`.

This package is a dedicated browser client for the coding-agent protocol server (WebSocket + RPC messages).

## Development

```bash
cd packages/coding-agent-web
npm install
npm run build
```

Then serve it from the coding-agent backend:

```bash
pi --mode web --serve-ui packages/coding-agent-web/dist
```

If you started web mode with `--web-token`, pass the token via query parameter:

```text
http://127.0.0.1:4781/?token=<token>
```
