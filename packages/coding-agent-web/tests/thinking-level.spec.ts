import { expect, test } from "@playwright/test";
import { setupApp, successResponse } from "./helpers.js";

test.describe("thinking level selector", () => {
	test("shows current thinking level", async ({ page }) => {
		await setupApp(page, { thinkingLevel: "high" });
		await expect(page.getByRole("button", { name: "Select thinking level" })).toContainText("high");
	});

	test("opens dropdown with all levels on click", async ({ page }) => {
		await setupApp(page);
		await page.getByRole("button", { name: "Select thinking level" }).click();

		await expect(page.getByRole("button", { name: /No reasoning/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Very brief reasoning/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Light reasoning/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Moderate reasoning/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Deep reasoning/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Maximum reasoning/ })).toBeVisible();

		await expect(page).toHaveScreenshot("thinking-level-dropdown.png");
	});

	test("selects a new thinking level and updates display", async ({ page }) => {
		await setupApp(page, {
			thinkingLevel: "medium",
			handlers: {
				set_thinking_level: successResponse("set_thinking_level"),
			},
		});

		// Current level is "medium"
		await expect(page.getByRole("button", { name: "Select thinking level" })).toContainText("medium");

		// Open dropdown and select "high"
		await page.getByRole("button", { name: "Select thinking level" }).click();
		await page.getByRole("button", { name: /Deep reasoning/ }).click();

		// Dropdown should close and button should show the new level
		await expect(page.getByRole("button", { name: "Select thinking level" })).toContainText("high");
	});

	test("closes dropdown when clicking outside", async ({ page }) => {
		await setupApp(page);
		await page.getByRole("button", { name: "Select thinking level" }).click();

		// Dropdown is open
		await expect(page.getByRole("button", { name: /No reasoning/ })).toBeVisible();

		// Click outside the dropdown
		await page.getByPlaceholder(/Ask anything/).click();

		// Dropdown should be closed
		await expect(page.getByRole("button", { name: /No reasoning/ })).not.toBeVisible();
	});
});
