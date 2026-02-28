import {
	a2uiSurfaceComplete,
	a2uiSurfaceUpdate,
	agentEnd,
	agentStart,
	messageEnd,
	setupApp,
	successResponse,
	textDelta,
	textEnd,
	toolCallEnd,
	toolExecutionEnd,
	toolExecutionStart,
} from "./helpers.js";
import { expect, test } from "./test.js";

test.describe("a2ui surfaces", () => {
	test("renders an A2UI surface inline in the chat", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Show tests");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvents([
			agentStart(),
			textDelta("Here are the results:"),
			textEnd("Here are the results:"),
			toolCallEnd("tc_a2ui", "render_ui", { surface_id: "test-results", messages: [] }),
			messageEnd([
				{ type: "text", text: "Here are the results:" },
				{
					type: "toolCall",
					id: "tc_a2ui",
					name: "render_ui",
					arguments: { surface_id: "test-results", messages: [] },
				},
			]),
			toolExecutionStart("render_ui"),
		]);

		// Emit A2UI surface update
		server.emitEvent(
			a2uiSurfaceUpdate("test-results", [
				{ createSurface: { surfaceId: "test-results", catalogId: "standard" } },
				{
					updateComponents: {
						surfaceId: "test-results",
						components: [
							{ id: "root", component: "Column", children: ["title", "btn-row"] },
							{ id: "title", component: "Text", text: { literalString: "Test Results" }, usageHint: "h2" },
							{ id: "btn-row", component: "Row", children: ["approve-btn"] },
							{
								id: "approve-btn",
								component: "Button",
								child: "approve-text",
								action: { event: { name: "approve", context: {} } },
							},
							{ id: "approve-text", component: "Text", text: { literalString: "Approve" } },
						],
					},
				},
				{ updateDataModel: { surfaceId: "test-results", value: {} } },
			]),
		);

		server.emitEvent(toolExecutionEnd("render_ui", "UI surface 'test-results' rendered successfully."));

		// Verify the A2UI surface text is visible
		await expect(page.getByText("Test Results")).toBeVisible();
		await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();

		server.emitEvent(agentEnd());

		await expect(page).toHaveScreenshot("a2ui-surface-inline.png");
	});

	test("marks surface as read-only after agent_end", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Show tests");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvents([
			agentStart(),
			toolCallEnd("tc_a2ui", "render_ui", { surface_id: "demo", messages: [] }),
			messageEnd([
				{ type: "toolCall", id: "tc_a2ui", name: "render_ui", arguments: { surface_id: "demo", messages: [] } },
			]),
			toolExecutionStart("render_ui"),
		]);

		server.emitEvent(
			a2uiSurfaceUpdate("demo", [
				{ createSurface: { surfaceId: "demo", catalogId: "standard" } },
				{
					updateComponents: {
						surfaceId: "demo",
						components: [
							{ id: "root", component: "Column", children: ["action-btn"] },
							{
								id: "action-btn",
								component: "Button",
								child: "action-text",
								action: { event: { name: "do_thing", context: {} } },
							},
							{ id: "action-text", component: "Text", text: { literalString: "Do Thing" } },
						],
					},
				},
			]),
		);

		server.emitEvent(toolExecutionEnd("render_ui", "UI surface 'demo' rendered successfully."));

		// Button should be enabled before agent_end
		const button = page.getByRole("button", { name: "Do Thing" });
		await expect(button).toBeVisible();
		await expect(button).toBeEnabled();

		await expect(page).toHaveScreenshot("a2ui-surface-interactive.png");

		// Agent ends — surface becomes read-only
		server.emitEvents([a2uiSurfaceComplete("demo"), agentEnd()]);

		await expect(button).toBeDisabled();

		await expect(page).toHaveScreenshot("a2ui-surface-read-only.png");
	});

	test("renders data-bound text from the data model", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Show data");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvents([
			agentStart(),
			toolCallEnd("tc_a2ui", "render_ui", { surface_id: "data-demo", messages: [] }),
			messageEnd([
				{
					type: "toolCall",
					id: "tc_a2ui",
					name: "render_ui",
					arguments: { surface_id: "data-demo", messages: [] },
				},
			]),
			toolExecutionStart("render_ui"),
		]);

		server.emitEvent(
			a2uiSurfaceUpdate("data-demo", [
				{ createSurface: { surfaceId: "data-demo", catalogId: "standard" } },
				{
					updateComponents: {
						surfaceId: "data-demo",
						components: [
							{ id: "root", component: "Column", children: ["greeting"] },
							{ id: "greeting", component: "Text", text: { path: "/user/name" } },
						],
					},
				},
				{
					updateDataModel: {
						surfaceId: "data-demo",
						value: { user: { name: "Alice" } },
					},
				},
			]),
		);

		server.emitEvent(toolExecutionEnd("render_ui", "OK"));

		// Data-bound text should render
		await expect(page.getByText("Alice")).toBeVisible();

		server.emitEvent(agentEnd());

		await expect(page).toHaveScreenshot("a2ui-data-bound-text.png");
	});

	test("renders checkbox component", async ({ server, page }) => {
		await setupApp(server, page, {
			handlers: {
				prompt: successResponse("prompt"),
			},
		});

		await page.getByPlaceholder(/Ask anything/).fill("Show form");
		await page.getByRole("button", { name: "Send" }).click();

		server.emitEvents([
			agentStart(),
			toolCallEnd("tc_a2ui", "render_ui", { surface_id: "form-demo", messages: [] }),
			messageEnd([
				{
					type: "toolCall",
					id: "tc_a2ui",
					name: "render_ui",
					arguments: { surface_id: "form-demo", messages: [] },
				},
			]),
			toolExecutionStart("render_ui"),
		]);

		server.emitEvent(
			a2uiSurfaceUpdate("form-demo", [
				{ createSurface: { surfaceId: "form-demo", catalogId: "standard" } },
				{
					updateComponents: {
						surfaceId: "form-demo",
						components: [
							{ id: "root", component: "Column", children: ["check1"] },
							{
								id: "check1",
								component: "CheckBox",
								label: { literalString: "Enable feature" },
								value: { path: "/enabled" },
							},
						],
					},
				},
				{
					updateDataModel: {
						surfaceId: "form-demo",
						value: { enabled: false },
					},
				},
			]),
		);

		server.emitEvent(toolExecutionEnd("render_ui", "OK"));

		// Checkbox with label should render
		await expect(page.getByText("Enable feature")).toBeVisible();
		const checkbox = page.getByRole("checkbox");
		await expect(checkbox).toBeVisible();
		await expect(checkbox).not.toBeChecked();

		server.emitEvent(agentEnd());

		await expect(page).toHaveScreenshot("a2ui-checkbox.png");
	});
});
