import {
	agentEnd,
	agentStart,
	extensionError,
	messageEnd,
	setupApp,
	successResponse,
	textDelta,
	textEnd,
	thinkingDelta,
	thinkingEnd,
	toolCallEnd,
	toolExecutionEnd,
	toolExecutionStart,
} from "./helpers.js";
import { expect, test } from "./test.js";

test.describe("streaming", () => {
	test("shows streaming dot when agent starts, removes it when agent ends", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		// Send a prompt to trigger the agent
		await page.getByPlaceholder(/Ask anything/).fill("Do something");
		await page.getByRole("button", { name: "Send" }).click();

		// Emit agent_start — streaming dot should appear
		server.emitEvent(agentStart());

		// The stop button appears during streaming
		await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

		// Emit agent_end — streaming state should end
		server.emitEvent(agentEnd());
		await expect(page.getByRole("button", { name: "Stop" })).not.toBeVisible();
	});

	test("streams text deltas into assistant message", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Hi");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvents([
			agentStart(),
			textDelta("Hello "),
			textDelta("world!"),
			textEnd("Hello world!"),
			messageEnd([{ type: "text", text: "Hello world!" }]),
			agentEnd(),
		]);

		await expect(page.getByText("Hello world!")).toBeVisible();

		await expect(page).toHaveScreenshot("streamed-text-complete.png");
	});

	test("shows tool call phases: calling → running → done", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Read file");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvent(agentStart());

		// Emit tool call end — creates tool step in "calling" phase
		server.emitEvent(toolCallEnd("tc1", "read", { path: "package.json" }));
		await expect(page.getByText("package.json")).toBeVisible();

		// Emit tool execution start — transitions to "running" phase
		server.emitEvent(toolExecutionStart("read"));

		// Emit tool execution end — transitions to "done" phase
		server.emitEvent(toolExecutionEnd("read", '{"name":"my-project"}'));

		// The tool step should now show a success indicator
		// Click to expand and verify the result preview
		await page.getByText("package.json").click();
		await expect(page.getByText('"name":"my-project"')).toBeVisible();

		server.emitEvent(agentEnd());

		await expect(page).toHaveScreenshot("tool-call-phases-done.png");
	});

	test("shows error tool result with error styling", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Run tests");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvents([
			agentStart(),
			toolCallEnd("tc1", "bash", { command: "npm test" }),
			toolExecutionStart("bash"),
		]);

		// Error result
		server.emitEvent(toolExecutionEnd("bash", "Tests failed\n\nCommand exited with code 1", true));

		// Expand to see the error output
		await page.getByText("npm test").click();
		await expect(page.getByText("Tests failed")).toBeVisible();

		server.emitEvent(agentEnd());

		await expect(page).toHaveScreenshot("tool-call-error-expanded.png");
	});

	test("shows extension error as error message", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Do something");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvents([agentStart(), extensionError("Provider rate limit exceeded"), agentEnd()]);

		await expect(page.getByText("Extension error: Provider rate limit exceeded")).toBeVisible();

		await expect(page).toHaveScreenshot("extension-error.png");
	});

	test("handles thinking deltas without showing them visually", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Think hard");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvents([
			agentStart(),
			thinkingDelta("Let me analyze this..."),
			thinkingEnd("Let me analyze this..."),
			textDelta("Here is my answer."),
			textEnd("Here is my answer."),
			messageEnd([
				{ type: "thinking", thinking: "Let me analyze this..." },
				{ type: "text", text: "Here is my answer." },
			]),
			agentEnd(),
		]);

		// Thinking content is not rendered visually
		await expect(page.getByText("Let me analyze this...")).not.toBeVisible();
		// But the answer is
		await expect(page.getByText("Here is my answer.")).toBeVisible();
	});

	test("abort button stops the agent", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
				abort: successResponse("abort"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Long task");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvent(agentStart());
		await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

		// Click stop — the abort handler returns success
		await page.getByRole("button", { name: "Stop" }).click();

		// Simulate the server ending the agent after abort
		server.emitEvent(agentEnd());
		await expect(page.getByRole("button", { name: "Stop" })).not.toBeVisible();
	});
});
