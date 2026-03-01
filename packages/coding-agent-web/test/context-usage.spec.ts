import { agentEnd, agentStart, messageEnd, setupApp, successResponse, textDelta, textEnd } from "./helpers.js";
import { expect, test } from "./test.js";

test.describe("context usage indicator", () => {
	test("shows context usage button in title bar when usage data is available", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
			contextUsage: { tokens: 15_944, contextWindow: 200_000, percent: 8 },
		});

		await expect(page.getByRole("button", { name: "Context usage" })).toBeVisible();
	});

	test("does not show context usage button when no usage data and not streaming", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
			contextUsage: null,
		});

		await expect(page.getByRole("button", { name: "Context usage" })).not.toBeVisible();
	});

	test("opens tooltip on click showing tokens and usage", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
			contextUsage: { tokens: 15_944, contextWindow: 200_000, percent: 8 },
		});

		await page.getByRole("button", { name: "Context usage" }).click();

		await expect(page.getByText("15,944")).toBeVisible();
		await expect(page.getByText("Tokens")).toBeVisible();
		await expect(page.getByText("8%")).toBeVisible();
		await expect(page.getByText("Usage")).toBeVisible();

		await expect(page).toHaveScreenshot("context-usage-tooltip-open.png");
	});

	test("closes tooltip when clicking outside", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
			contextUsage: { tokens: 15_944, contextWindow: 200_000, percent: 8 },
		});

		await page.getByRole("button", { name: "Context usage" }).click();
		await expect(page.getByText("15,944")).toBeVisible();

		// Click outside the tooltip
		await page.mouse.click(100, 300);

		await expect(page.getByText("15,944")).not.toBeVisible();
	});

	test("toggles tooltip on repeated clicks", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
			contextUsage: { tokens: 5_000, contextWindow: 200_000, percent: 2.5 },
		});

		const button = page.getByRole("button", { name: "Context usage" });

		// Open
		await button.click();
		await expect(page.getByText("5,000")).toBeVisible();

		// Close
		await button.click();
		await expect(page.getByText("5,000")).not.toBeVisible();

		// Re-open
		await button.click();
		await expect(page.getByText("5,000")).toBeVisible();
	});

	test("shows spinner icon during streaming", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
			contextUsage: { tokens: 10_000, contextWindow: 200_000, percent: 5 },
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Do something");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvent(agentStart());

		// The context usage button should still be visible during streaming
		await expect(page.getByRole("button", { name: "Context usage" })).toBeVisible();

		server.emitEvents([
			textDelta("Done."),
			textEnd("Done."),
			messageEnd([{ type: "text", text: "Done." }]),
			agentEnd(),
		]);

		// Still visible after streaming ends
		await expect(page.getByRole("button", { name: "Context usage" })).toBeVisible();
	});

	test("does not show title bar or usage button when there are no messages", async ({ server, page }) => {
		await setupApp(server, page, {
			contextUsage: { tokens: 0, contextWindow: 200_000, percent: 0 },
		});

		// No messages means no session title bar
		await expect(page.getByRole("button", { name: "Context usage" })).not.toBeVisible();
	});

	test("displays large token counts with thousands separators", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
			contextUsage: { tokens: 142_857, contextWindow: 200_000, percent: 71 },
		});

		await page.getByRole("button", { name: "Context usage" }).click();

		await expect(page.getByText("142,857")).toBeVisible();
		await expect(page.getByText("71%")).toBeVisible();
	});
});
