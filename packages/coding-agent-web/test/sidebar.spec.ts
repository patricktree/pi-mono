import type { ClientCommand } from "../src/protocol/types.js";
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

function mockListDirectoryHandler() {
	const directories: Record<string, Array<{ name: string; isDirectory: boolean }>> = {
		"/Users/user/workspace/project": [
			{ name: "src", isDirectory: true },
			{ name: "test", isDirectory: true },
			{ name: "docs", isDirectory: true },
		],
		"/Users/user/workspace/project/src": [
			{ name: "components", isDirectory: true },
			{ name: "utils", isDirectory: true },
		],
		"/Users/user/workspace": [
			{ name: "project", isDirectory: true },
			{ name: "other-project", isDirectory: true },
		],
		"/Users/user": [
			{ name: "workspace", isDirectory: true },
			{ name: "Documents", isDirectory: true },
			{ name: "Downloads", isDirectory: true },
		],
		"/Users": [{ name: "user", isDirectory: true }],
		"/": [
			{ name: "Users", isDirectory: true },
			{ name: "tmp", isDirectory: true },
		],
	};

	return (cmd: Extract<ClientCommand, { type: "list_directory" }>) => {
		const requestedPath = cmd.path === "~" ? "/Users/user" : cmd.path;
		const entries = directories[requestedPath] ?? [];
		return {
			command: "list_directory" as const,
			success: true as const,
			data: { absolutePath: requestedPath, entries },
		};
	};
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

	test("creates new session via directory picker", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
			messages: [{ role: "user", content: "Old message", timestamp: NOW }],
			handlers: {
				new_session: successResponse("new_session", { cancelled: false }),
			},
		});

		server.setHandler("list_directory", mockListDirectoryHandler());

		// Old message is visible (appears in title bar + bubble)
		await expect(page.getByText("Old message").first()).toBeVisible();

		// Update handlers to reflect the new session state
		server.setStaticHandler(
			"get_state",
			successResponse("get_state", { sessionId: "s-new", thinkingLevel: "medium" }),
		);
		server.setStaticHandler("get_messages", successResponse("get_messages", { messages: [] }));
		server.setStaticHandler("list_sessions", successResponse("list_sessions", { sessions: mockSessions() }));

		// Click "New session" to open the directory picker
		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();

		// Directory picker should appear with the current session's cwd
		await expect(page.getByTestId("directory-picker")).toBeVisible();
		await expect(page.getByTestId("directory-select-btn")).toBeVisible();

		// Click "Select" to confirm with the current directory
		await page.getByTestId("directory-select-btn").click();

		// Emit session_changed to invalidate TanStack Query caches
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
				switch_session: successResponse("switch_session", { cancelled: false }),
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

test.describe("directory picker", () => {
	test("opens with current session cwd and shows directory entries", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", mockListDirectoryHandler());

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();

		// Directory picker opens with the current session's cwd
		await expect(page.getByTestId("directory-picker")).toBeVisible();
		// Should show subdirectories of /Users/user/workspace/project
		await expect(page.getByTestId("dir-entry-src")).toBeVisible();
		await expect(page.getByTestId("dir-entry-test")).toBeVisible();
		await expect(page.getByTestId("dir-entry-docs")).toBeVisible();

		await expect(page).toHaveScreenshot("directory-picker-open.png");
	});

	test("navigates into a subdirectory", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", mockListDirectoryHandler());

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();

		await expect(page.getByTestId("directory-picker")).toBeVisible();

		// Navigate into "src" subdirectory
		await page.getByTestId("dir-entry-src").click();

		// Should now show contents of /Users/user/workspace/project/src
		await expect(page.getByTestId("dir-entry-components")).toBeVisible();
		await expect(page.getByTestId("dir-entry-utils")).toBeVisible();
		// Previous entries should be gone
		await expect(page.getByTestId("dir-entry-test")).not.toBeVisible();
	});

	test("navigates via breadcrumb", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", mockListDirectoryHandler());

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();
		await expect(page.getByTestId("directory-picker")).toBeVisible();

		// Navigate into "src" first
		await page.getByTestId("dir-entry-src").click();
		await expect(page.getByTestId("dir-entry-components")).toBeVisible();

		// Click "workspace" in the breadcrumb to navigate up
		await page.getByTestId("directory-breadcrumb").getByText("workspace").click();

		// Should now show contents of /Users/user/workspace
		await expect(page.getByTestId("dir-entry-project")).toBeVisible();
		await expect(page.getByTestId("dir-entry-other-project")).toBeVisible();
	});

	test("closes on cancel button", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", mockListDirectoryHandler());

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();
		await expect(page.getByTestId("directory-picker")).toBeVisible();

		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByTestId("directory-picker")).not.toBeVisible();
	});

	test("closes on Escape key", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", mockListDirectoryHandler());

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();
		await expect(page.getByTestId("directory-picker")).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("directory-picker")).not.toBeVisible();
	});

	test("closes on backdrop click", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", mockListDirectoryHandler());

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();
		await expect(page.getByTestId("directory-picker")).toBeVisible();

		// Click the backdrop (top-left corner, outside the dialog)
		await page.getByTestId("directory-picker").click({ position: { x: 5, y: 5 } });
		await expect(page.getByTestId("directory-picker")).not.toBeVisible();
	});

	test("sends cwd with new_session command after selecting directory", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", mockListDirectoryHandler());

		// Track the new_session command to verify cwd is passed
		let receivedCwd: string | undefined;
		server.setHandler("new_session", (cmd) => {
			receivedCwd = (cmd as unknown as { cwd?: string }).cwd;
			return {
				command: "new_session",
				success: true,
				data: { cancelled: false },
			};
		});

		server.setStaticHandler(
			"get_state",
			successResponse("get_state", { sessionId: "s-new", thinkingLevel: "medium" }),
		);
		server.setStaticHandler("get_messages", successResponse("get_messages", { messages: [] }));
		server.setStaticHandler("list_sessions", successResponse("list_sessions", { sessions: mockSessions() }));

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();
		await expect(page.getByTestId("directory-picker")).toBeVisible();

		// Navigate into "src"
		await page.getByTestId("dir-entry-src").click();
		await expect(page.getByTestId("dir-entry-components")).toBeVisible();

		// Select the directory
		await page.getByTestId("directory-select-btn").click();

		// Emit session_changed to complete the flow
		server.emitEvent(sessionChanged("s-new", "new"));

		// Verify the cwd was sent
		await expect(async () => {
			expect(receivedCwd).toBe("/Users/user/workspace/project/src");
		}).toPass({ timeout: 2000 });
	});

	test("defaults to home directory when no session is active", async ({ server, page }) => {
		await setupApp(server, page, {
			sessions: [],
		});

		// Track list_directory calls to verify initial path
		const requestedPaths: string[] = [];
		server.setHandler("list_directory", (cmd) => {
			requestedPaths.push(cmd.path);
			return mockListDirectoryHandler()(cmd);
		});

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();
		await expect(page.getByTestId("directory-picker")).toBeVisible();

		// The first list_directory call should be for "~"
		await expect(async () => {
			expect(requestedPaths[0]).toBe("~");
		}).toPass({ timeout: 2000 });
	});

	test("shows empty state when directory has no subdirectories", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", (cmd) => {
			return {
				command: "list_directory",
				success: true,
				data: {
					absolutePath: cmd.path === "~" ? "/Users/user" : cmd.path,
					entries: [],
				},
			};
		});

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();
		await expect(page.getByTestId("directory-picker")).toBeVisible();

		await expect(page.getByText("No subdirectories")).toBeVisible();
	});

	test("shows error when list_directory fails", async ({ server, page }) => {
		await setupApp(server, page, {
			sessionId: "s1",
			sessions: mockSessions(),
		});

		server.setHandler("list_directory", () => {
			return {
				command: "list_directory",
				success: false,
				error: "Permission denied: /root",
			};
		});

		await page.getByRole("button", { name: "Open sidebar" }).click();
		await page.getByRole("button", { name: /New session/ }).click();
		await expect(page.getByTestId("directory-picker")).toBeVisible();

		await expect(page.getByTestId("directory-entries").getByText("Permission denied: /root")).toBeVisible();
	});
});
