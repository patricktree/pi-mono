import { expect, test } from "@playwright/test";
import { agentEnd, agentStart, emitEvent, setupApp, successResponse, textDelta, textEnd } from "./helpers.js";

test.describe("steering messages", () => {
	test("queues steering message when sending during streaming", async ({ page }) => {
		await setupApp(page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		// Send initial prompt
		await page.getByPlaceholder(/Ask anything/).fill("Initial task");
		await page.getByRole("button", { name: "Send" }).click();

		// Start streaming
		await emitEvent(page, agentStart());
		await emitEvent(page, textDelta("Working on it..."));

		// Send a steering message while streaming
		await page.getByPlaceholder(/Send a steering message/).fill("Focus on auth only");
		await page.getByRole("button", { name: "Send" }).click();

		// The scheduled messages section should appear
		await expect(page.getByText("Scheduled")).toBeVisible();
		await expect(page.getByText("Focus on auth only")).toBeVisible();

		await expect(page).toHaveScreenshot("scheduled-steering-message.png");
	});

	test("restore-to-editor moves scheduled message text back to prompt", async ({ page }) => {
		await setupApp(page, {
			handlers: {
				prompt: successResponse("prompt"),
				clear_queue: successResponse("clear_queue"),
			},
		});

		// Send initial prompt and start streaming
		await page.getByPlaceholder(/Ask anything/).fill("Do work");
		await page.getByRole("button", { name: "Send" }).click();
		await emitEvent(page, agentStart());
		await emitEvent(page, textDelta("Processing..."));

		// Send a steering message
		await page.getByPlaceholder(/Send a steering message/).fill("Change direction");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByText("Change direction")).toBeVisible();

		// Click "Restore to editor"
		await page.getByRole("button", { name: "Restore to editor" }).click();

		// Scheduled section should disappear and text should be in the prompt
		await expect(page.getByText("Scheduled")).not.toBeVisible();
		await expect(page.getByPlaceholder(/Send a steering message/)).toHaveValue("Change direction");
	});

	test("scheduled message moves to timeline when server interweaves it", async ({ page }) => {
		await setupApp(page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		// Send initial prompt and start streaming
		await page.getByPlaceholder(/Ask anything/).fill("Start");
		await page.getByRole("button", { name: "Send" }).click();
		await emitEvent(page, agentStart());
		await emitEvent(page, textDelta("Working..."));

		// Send steering message
		await page.getByPlaceholder(/Send a steering message/).fill("Redirect");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByText("Scheduled")).toBeVisible();

		// Server emits message_start for the user message — this interweaves it
		await emitEvent(page, {
			type: "message_start",
			message: { role: "user", content: "Redirect", timestamp: Date.now() },
		});

		// The scheduled section should disappear (message consumed)
		await expect(page.getByText("Scheduled")).not.toBeVisible();

		// End the agent run
		await emitEvent(page, textEnd("Working..."));
		await emitEvent(page, agentEnd());
	});
});
