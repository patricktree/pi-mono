import { setupApp } from "./helpers.js";
import { expect, test } from "./test.js";

test.describe("message history", () => {
	test("displays pre-loaded user message as right-aligned bubble", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [{ role: "user", content: "Hello from history", timestamp: Date.now() }],
		});
		// Text appears in both SessionTitleBar and UserBubble
		await expect(page.getByText("Hello from history").first()).toBeVisible();
	});

	test("displays pre-loaded assistant message with markdown", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [
				{ role: "user", content: "Explain something", timestamp: Date.now() - 2000 },
				{
					role: "assistant",
					content: [{ type: "text", text: "Here is a **bold** explanation." }],
					timestamp: Date.now() - 1000,
				},
			],
		});
		await expect(page.getByText("Explain something").first()).toBeVisible();
		// Markdown bold renders as <strong>
		await expect(page.locator("strong", { hasText: "bold" })).toBeVisible();

		await expect(page).toHaveScreenshot("conversation-with-markdown.png");
	});

	test("displays pre-loaded tool call with done status and result", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [
				{ role: "user", content: "Read the file", timestamp: Date.now() - 3000 },
				{
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "tc1",
							name: "read",
							arguments: { path: "README.md" },
						},
					],
					timestamp: Date.now() - 2000,
				},
				{
					role: "toolResult",
					toolCallId: "tc1",
					toolName: "read",
					content: [{ type: "text", text: "# My Project\nSome content here" }],
					isError: false,
					timestamp: Date.now() - 1000,
				},
			],
		});

		// Tool step button shows label and file path
		const toolButton = page.getByRole("button", { name: /Read.*README\.md/ });
		await expect(toolButton).toBeVisible();

		await expect(page).toHaveScreenshot("tool-call-collapsed.png");

		// Expand the tool result
		await toolButton.click();
		await expect(page.getByText("# My Project")).toBeVisible();

		await expect(page).toHaveScreenshot("tool-call-expanded.png");
	});

	test("displays session title bar from first user message", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [
				{ role: "user", content: "Help me refactor auth", timestamp: Date.now() - 2000 },
				{
					role: "assistant",
					content: [{ type: "text", text: "Sure, I can help." }],
					timestamp: Date.now() - 1000,
				},
			],
		});
		// The SessionTitleBar shows the first user message as a title,
		// and the UserBubble shows it too — so it appears twice
		await expect(page.getByText("Help me refactor auth")).toHaveCount(2);
	});

	test("displays tool call with error status", async ({ server, page }) => {
		await setupApp(server, page, {
			messages: [
				{ role: "user", content: "Read missing file", timestamp: Date.now() - 3000 },
				{
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "tc1",
							name: "read",
							arguments: { path: "nonexistent.txt" },
						},
					],
					timestamp: Date.now() - 2000,
				},
				{
					role: "toolResult",
					toolCallId: "tc1",
					toolName: "read",
					content: [{ type: "text", text: "ENOENT: no such file or directory" }],
					isError: true,
					timestamp: Date.now() - 1000,
				},
			],
		});

		await expect(page.getByRole("button", { name: /Read.*nonexistent\.txt/ })).toBeVisible();

		await expect(page).toHaveScreenshot("tool-call-error.png");
	});
});
