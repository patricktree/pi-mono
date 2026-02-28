// Minimal no-op service worker to satisfy PWA installability requirements.
// This app requires a live WebSocket connection, so offline caching is not useful.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
