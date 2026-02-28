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

	test("reconstructs A2UI surface from render_ui tool call in history", async ({ server, page }) => {
		const a2uiMessages = [
			{ createSurface: { surfaceId: "departures", catalogId: "standard" } },
			{
				updateComponents: {
					surfaceId: "departures",
					components: [
						{ id: "root", component: "Column", children: ["title", "btn-row"] },
						{ id: "title", component: "Text", text: { literalString: "Departure Board" }, usageHint: "h2" },
						{ id: "btn-row", component: "Row", children: ["refresh-btn"] },
						{
							id: "refresh-btn",
							component: "Button",
							child: "refresh-text",
							action: { event: { name: "refresh", context: {} } },
						},
						{ id: "refresh-text", component: "Text", text: { literalString: "Refresh" } },
					],
				},
			},
			{ updateDataModel: { surfaceId: "departures", value: {} } },
		];

		await setupApp(server, page, {
			messages: [
				{ role: "user", content: "Show departures", timestamp: Date.now() - 3000 },
				{
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "tc_render",
							name: "render_ui",
							arguments: { surface_id: "departures", messages: a2uiMessages },
						},
					],
					timestamp: Date.now() - 2000,
				},
				{
					role: "toolResult",
					toolCallId: "tc_render",
					toolName: "render_ui",
					content: [{ type: "text", text: "UI surface 'departures' rendered successfully." }],
					isError: false,
					timestamp: Date.now() - 1000,
				},
			],
		});

		// The A2UI surface should be rendered from history
		await expect(page.getByText("Departure Board")).toBeVisible();
		// Restored surfaces are read-only (non-interactive)
		await expect(page.getByRole("button", { name: "Refresh" })).toBeDisabled();

		await expect(page).toHaveScreenshot("a2ui-surface-from-history.png");
	});

	test("deduplicates A2UI surfaces with same surface_id in history", async ({ server, page }) => {
		const makeA2uiMessages = (label: string) => [
			{ createSurface: { surfaceId: "status", catalogId: "standard" } },
			{
				updateComponents: {
					surfaceId: "status",
					components: [
						{ id: "root", component: "Column", children: ["label"] },
						{ id: "label", component: "Text", text: { literalString: label } },
					],
				},
			},
			{ updateDataModel: { surfaceId: "status", value: {} } },
		];

		await setupApp(server, page, {
			messages: [
				{ role: "user", content: "Show status", timestamp: Date.now() - 5000 },
				{
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "tc1",
							name: "render_ui",
							arguments: { surface_id: "status", messages: makeA2uiMessages("Version 1") },
						},
					],
					timestamp: Date.now() - 4000,
				},
				{
					role: "toolResult",
					toolCallId: "tc1",
					toolName: "render_ui",
					content: [{ type: "text", text: "OK" }],
					isError: false,
					timestamp: Date.now() - 3500,
				},
				{ role: "user", content: "Update it", timestamp: Date.now() - 3000 },
				{
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "tc2",
							name: "render_ui",
							arguments: { surface_id: "status", messages: makeA2uiMessages("Version 2") },
						},
					],
					timestamp: Date.now() - 2000,
				},
				{
					role: "toolResult",
					toolCallId: "tc2",
					toolName: "render_ui",
					content: [{ type: "text", text: "OK" }],
					isError: false,
					timestamp: Date.now() - 1000,
				},
			],
		});

		// Only the latest version of the surface should be visible
		await expect(page.getByText("Version 2")).toBeVisible();
		await expect(page.getByText("Version 1")).not.toBeVisible();

		await expect(page).toHaveScreenshot("a2ui-surface-deduplicated.png");
	});

	test("reconstructs A2UI surface with data-bound content from history", async ({ server, page }) => {
		const a2uiMessages = [
			{ createSurface: { surfaceId: "profile", catalogId: "standard" } },
			{
				updateComponents: {
					surfaceId: "profile",
					components: [
						{ id: "root", component: "Column", children: ["name-text"] },
						{ id: "name-text", component: "Text", text: { path: "/user/name" } },
					],
				},
			},
			{
				updateDataModel: {
					surfaceId: "profile",
					value: { user: { name: "Alice" } },
				},
			},
		];

		await setupApp(server, page, {
			messages: [
				{ role: "user", content: "Show profile", timestamp: Date.now() - 3000 },
				{
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "tc_profile",
							name: "render_ui",
							arguments: { surface_id: "profile", messages: a2uiMessages },
						},
					],
					timestamp: Date.now() - 2000,
				},
				{
					role: "toolResult",
					toolCallId: "tc_profile",
					toolName: "render_ui",
					content: [{ type: "text", text: "OK" }],
					isError: false,
					timestamp: Date.now() - 1000,
				},
			],
		});

		// Data-bound text should resolve from the data model
		await expect(page.getByText("Alice")).toBeVisible();

		await expect(page).toHaveScreenshot("a2ui-data-bound-from-history.png");
	});
});
