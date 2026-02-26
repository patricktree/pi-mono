import { sessionChanged, setupApp, successResponse } from "./helpers.js";
import { expect, test } from "./test.js";

const NOW = Date.now();

function mockSessions() {
	return [
		{
			path: "/tmp/s1.json",
			id: "s1",
			cwd: "/Users/user/workspace/project",
			name: "Refactor auth",
			created: new Date(NOW - 3600_000).toISOString(),
			modified: new Date(NOW - 600_000).toISOString(),
			messageCount: 5,
			firstMessage: "Help me refactor auth",
		},
		{
			path: "/tmp/s2.json",
			id: "s2",
			cwd: "/Users/user/workspace/project",
			name: "Fix CI pipeline",
			created: new Date(NOW - 86400_000).toISOString(),
			modified: new Date(NOW - 7200_000).toISOString(),
			messageCount: 3,
			firstMessage: "CI is broken",
		},
	];
}

test.describe("sidebar", () => {
	test("opens sidebar and shows session list", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await expect(page.getByText("Refactor auth")).toBeVisible();
		await expect(page.getByText("Fix CI pipeline")).toBeVisible();

		await expect(page).toHaveScreenshot("sidebar-open.png");
	});

	test("closes sidebar when clicking overlay", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await expect(page.getByText("Refactor auth")).toBeVisible();

		// Click the overlay (the fixed backdrop behind the sidebar)
		await page.mouse.click(700, 400);

		// The sidebar slides off-screen via transform — use toBeInViewport
		// since toBeVisible doesn't account for CSS transforms
		await expect(page.getByText("Refactor auth")).not.toBeInViewport();
	});

	test("shows new session button in sidebar", async ({ server, page }) => {
		await setupApp(server, page, {
			sessions: mockSessions(),
		});

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await expect(page.getByRole("button", { name: /New session/ })).toBeVisible();
	});

	test("creates new session on new-session click", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
			messages: [{ role: "user", content: "Old message", timestamp: NOW }],
			handlers: {
				new_session: successResponse("new_session"),
			},
		});

		// Old message is visible (appears in title bar + bubble)
		await expect(page.getByText("Old message").first()).toBeVisible();

		// Update handlers to reflect the new session state
		server.setStaticHandler(
			"get_state",
			successResponse("get_state", { sessionId: "s-new", thinkingLevel: "medium" }),
		);
		server.setStaticHandler("get_messages", successResponse("get_messages", { messages: [] }));
		server.setStaticHandler("list_sessions", successResponse("list_sessions", { sessions: mockSessions() }));

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();

		// Emit session_changed to invalidate TanStack Query caches (staleTime: Infinity)
		// — mirrors the real backend which broadcasts this event on session transitions
		server.emitEvent(sessionChanged("s-new", "new"));

		// After new session, old message should be gone and empty state shown
		await expect(page.getByText("Old message").first()).not.toBeVisible();
		await expect(page.getByRole("heading", { name: "New session" })).toBeVisible();
	});

	test("switches session on session click", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
			messages: [{ role: "user", content: "Session 1 message", timestamp: NOW }],
			handlers: {
				switch_session: successResponse("switch_session"),
			},
		});

		await expect(page.getByText("Session 1 message").first()).toBeVisible();

		// Update handlers to return session 2 data after switch
		server.setStaticHandler("get_state", successResponse("get_state", { sessionId: "s2", thinkingLevel: "medium" }));
		server.setStaticHandler(
			"get_messages",
			successResponse("get_messages", {
				messages: [{ role: "user", content: "Session 2 message", timestamp: NOW }],
			}),
		);

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: "Fix CI pipeline" }).click();

		// Emit session_changed to invalidate TanStack Query caches (staleTime: Infinity)
		// — mirrors the real backend which broadcasts this event on session transitions
		server.emitEvent(sessionChanged("s2", "switch", "Fix CI pipeline"));

		// Session 2 content should now be visible
		await expect(page.getByText("Session 2 message").first()).toBeVisible();
		await expect(page.getByText("Session 1 message")).not.toBeVisible();
	});
});
