import { expect, test } from "@playwright/test";
import { setupApp } from "./helpers.js";

test.describe("layout and connection", () => {
	test("shows header with connected status", async ({ page }) => {
		await setupApp(page);
		await expect(page.getByText("Connected")).toBeVisible();
	});

	test("shows prompt input with placeholder", async ({ page }) => {
		await setupApp(page);
		await expect(page.getByPlaceholder(/Ask anything/)).toBeVisible();
	});

	test("shows empty state heading for new session", async ({ page }) => {
		await setupApp(page);
		await expect(page.getByRole("heading", { name: "New session" })).toBeVisible();

		await expect(page).toHaveScreenshot("empty-state.png");
	});

	test("shows cwd in empty state when session has cwd", async ({ page }) => {
		await setupApp(page, {
			sessionId: "s1",
			sessions: [
				{
					path: "/tmp/s1.json",
					id: "s1",
					cwd: "/Users/testuser/workspace/my-project",
					created: new Date().toISOString(),
					modified: new Date().toISOString(),
					messageCount: 0,
					firstMessage: "",
				},
			],
		});
		await expect(page.getByText("my-project", { exact: true })).toBeVisible();

		await expect(page).toHaveScreenshot("empty-state-with-cwd.png");
	});

	test("shows thinking-level selector in bottom toolbar", async ({ page }) => {
		await setupApp(page);
		await expect(page.getByRole("button", { name: "Select thinking level" })).toBeVisible();
	});

	test("shows shell and prompt mode toggle buttons", async ({ page }) => {
		await setupApp(page);
		await expect(page.getByRole("button", { name: "Shell mode" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Prompt mode" })).toBeVisible();
	});
});
