/**
 * Tests for the protocol extension UI bridge.
 */

import { describe, expect, test, vi } from "vitest";
import { createExtensionUIBridge } from "../../src/modes/protocol/extension-ui-bridge.js";
import type { RpcExtensionUIRequest } from "../../src/modes/protocol/types.js";

describe("ExtensionUIBridge", () => {
	test("select: resolves with selected value", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const promise = bridge.uiContext.select("Pick one", ["a", "b", "c"]);

		// Should have emitted a request
		expect(output).toHaveBeenCalledTimes(1);
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.type).toBe("extension_ui_request");
		expect(request.method).toBe("select");

		// Resolve it
		bridge.resolveResponse({ type: "extension_ui_response", id: request.id, value: "b" });

		const result = await promise;
		expect(result).toBe("b");
	});

	test("select: returns undefined on cancel", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const promise = bridge.uiContext.select("Pick", ["x"]);
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;

		bridge.resolveResponse({ type: "extension_ui_response", id: request.id, cancelled: true });

		const result = await promise;
		expect(result).toBeUndefined();
	});

	test("confirm: resolves with boolean", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const promise = bridge.uiContext.confirm("Sure?", "This action is irreversible");
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.method).toBe("confirm");

		bridge.resolveResponse({ type: "extension_ui_response", id: request.id, confirmed: true });

		const result = await promise;
		expect(result).toBe(true);
	});

	test("confirm: returns false on cancel", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const promise = bridge.uiContext.confirm("Sure?", "msg");
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;

		bridge.resolveResponse({ type: "extension_ui_response", id: request.id, cancelled: true });

		expect(await promise).toBe(false);
	});

	test("input: resolves with text value", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const promise = bridge.uiContext.input("Name:", "placeholder");
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.method).toBe("input");

		bridge.resolveResponse({ type: "extension_ui_response", id: request.id, value: "Alice" });

		expect(await promise).toBe("Alice");
	});

	test("input: returns undefined on cancel", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const promise = bridge.uiContext.input("Name:");
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;

		bridge.resolveResponse({ type: "extension_ui_response", id: request.id, cancelled: true });

		expect(await promise).toBeUndefined();
	});

	test("editor: resolves with text", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const promise = bridge.uiContext.editor("Edit code", "initial text");
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.method).toBe("editor");

		bridge.resolveResponse({ type: "extension_ui_response", id: request.id, value: "edited text" });

		expect(await promise).toBe("edited text");
	});

	test("editor: returns undefined on cancel", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const promise = bridge.uiContext.editor("Edit");
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;

		bridge.resolveResponse({ type: "extension_ui_response", id: request.id, cancelled: true });

		expect(await promise).toBeUndefined();
	});

	test("notify: fires and forgets", () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		bridge.uiContext.notify("Hello!", "info");

		expect(output).toHaveBeenCalledTimes(1);
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.method).toBe("notify");
		if (request.method === "notify") {
			expect(request.message).toBe("Hello!");
			expect(request.notifyType).toBe("info");
		}
	});

	test("setStatus: fires and forgets", () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		bridge.uiContext.setStatus("git", "main");

		expect(output).toHaveBeenCalledTimes(1);
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.method).toBe("setStatus");
	});

	test("setTitle: fires and forgets", () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		bridge.uiContext.setTitle("My Session");

		expect(output).toHaveBeenCalledTimes(1);
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.method).toBe("setTitle");
	});

	test("setEditorText: fires set_editor_text", () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		bridge.uiContext.setEditorText("hello world");

		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.method).toBe("set_editor_text");
	});

	test("setWidget: sends string array content", () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		bridge.uiContext.setWidget("my-widget", ["line1", "line2"], { placement: "aboveEditor" });

		expect(output).toHaveBeenCalledTimes(1);
		const request = output.mock.calls[0][0] as RpcExtensionUIRequest;
		expect(request.method).toBe("setWidget");
	});

	test("select: respects aborted signal", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const controller = new AbortController();
		controller.abort();

		const result = await bridge.uiContext.select("Pick", ["a"], { signal: controller.signal });
		expect(result).toBeUndefined();
		// Should not have emitted a request since signal was already aborted
		expect(output).not.toHaveBeenCalled();
	});

	test("select: resolves default on timeout", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const result = await bridge.uiContext.select("Pick", ["a"], { timeout: 10 });
		expect(result).toBeUndefined();
	});

	test("resolveResponse: ignores unknown ids", () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		// Should not throw
		bridge.resolveResponse({ type: "extension_ui_response", id: "nonexistent", value: "x" });
	});

	test("multiple concurrent requests resolve independently", async () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);

		const p1 = bridge.uiContext.select("First", ["a", "b"]);
		const p2 = bridge.uiContext.input("Second");

		expect(output).toHaveBeenCalledTimes(2);
		const req1 = output.mock.calls[0][0] as RpcExtensionUIRequest;
		const req2 = output.mock.calls[1][0] as RpcExtensionUIRequest;
		expect(req1.id).not.toBe(req2.id);

		// Resolve in reverse order
		bridge.resolveResponse({ type: "extension_ui_response", id: req2.id, value: "typed" });
		bridge.resolveResponse({ type: "extension_ui_response", id: req1.id, value: "a" });

		expect(await p1).toBe("a");
		expect(await p2).toBe("typed");
	});

	test("getEditorText returns empty string", () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);
		expect(bridge.uiContext.getEditorText()).toBe("");
	});

	test("theme is accessible", () => {
		const output = vi.fn();
		const bridge = createExtensionUIBridge(output);
		expect(bridge.uiContext.theme).toBeDefined();
	});
});
