import { bashResponse, setupApp, successResponse } from "./helpers.js";
import { expect, test } from "./test.js";

test.describe("input modes", () => {
	test("sends prompt and shows user bubble", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Hello agent");
		await page.getByRole("button", { name: "Send" }).click();

		// Text appears in both SessionTitleBar and UserBubble
		await expect(page.getByText("Hello agent").first()).toBeVisible();
		// Prompt input should be cleared after sending
		await expect(page.getByPlaceholder(/Ask anything/)).toHaveValue("");
	});

	test("auto-switches to shell mode when typing ! prefix", async ({ server, page }) => {
		await setupApp(server, page);

		await page.locator("textarea").fill("!ls -la");

		// Shell mode should now be active — placeholder changes
		await expect(page.getByPlaceholder("Enter shell command...")).toBeVisible();

		await expect(page).toHaveScreenshot("shell-mode-active.png");
	});

	test("auto-switches back to prompt mode when removing ! prefix", async ({ server, page }) => {
		await setupApp(server, page);

		// Use the generic textarea locator since the placeholder changes between modes
		const textarea = page.locator("textarea");
		await textarea.fill("!ls");
		await expect(page.getByPlaceholder("Enter shell command...")).toBeVisible();

		// Clear the text — should switch back to prompt mode
		await textarea.fill("normal prompt");
		await expect(page.getByPlaceholder(/Ask anything/)).toBeVisible();
	});

	test("toggles to shell mode via toolbar button", async ({ server, page }) => {
		await setupApp(server, page);

		await page.getByRole("button", { name: "Shell mode" }).click();
		await expect(page.getByPlaceholder("Enter shell command...")).toBeVisible();

		await page.getByRole("button", { name: "Prompt mode" }).click();
		await expect(page.getByPlaceholder(/Ask anything/)).toBeVisible();
	});

	test("executes bash command and shows result", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				bash: bashResponse({
					output: "total 42\ndrwxr-xr-x  5 user  staff  160 Jan  1 00:00 src",
					exitCode: 0,
					cancelled: false,
					truncated: false,
				}),
			},
		});

		// Type with ! prefix — auto-switches to shell mode and executes as bash
		await page.locator("textarea").fill("!ls -la");
		await page.getByRole("button", { name: "Send" }).click();

		// Bash result should show the command and output
		await expect(page.getByText("$ ls -la")).toBeVisible();
		await expect(page.getByText("total 42")).toBeVisible();

		await expect(page).toHaveScreenshot("bash-result.png");
	});

	test("sends bash command with ! prefix in prompt mode", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				bash: bashResponse({
					output: "hello world",
					exitCode: 0,
					cancelled: false,
					truncated: false,
				}),
			},
		});

		// Type with ! prefix in prompt mode — should auto-switch and execute as bash
		await page.getByPlaceholder(/Ask anything/).fill("!echo hello world");
		await page.getByRole("button", { name: "Send" }).click();

		await expect(page.getByText("hello world", { exact: true })).toBeVisible();
	});

	test("shows image attachment button in prompt mode only", async ({ server, page }) => {
		await setupApp(server, page);

		// In prompt mode, attach button should be visible
		await expect(page.getByRole("button", { name: "Attach image" })).toBeVisible();

		// Switch to shell mode — attach button should be hidden
		await page.getByRole("button", { name: "Shell mode" }).click();
		await expect(page.getByRole("button", { name: "Attach image" })).not.toBeVisible();
	});
});
