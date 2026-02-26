import { test as base } from "@playwright/test";
import { TestWsServer } from "./test-ws-server.js";

/**
 * Custom test function that provides a worker-scoped `server` fixture.
 * One TestWsServer is created per Playwright worker and shared across all
 * tests that run on that worker. The server is closed when the worker exits.
 */
export const test = base.extend<object, { server: TestWsServer }>({
	server: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature requires destructured parameter
		async ({}, use) => {
			const server = await TestWsServer.create();
			await use(server);
			await server.close();
		},
		{ scope: "worker" },
	],
});

export { expect } from "@playwright/test";
