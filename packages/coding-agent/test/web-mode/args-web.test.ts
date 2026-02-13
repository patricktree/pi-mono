/**
 * Tests for web-mode CLI argument parsing.
 */

import { describe, expect, test } from "vitest";
import { parseArgs } from "../../src/cli/args.js";

describe("parseArgs web mode flags", () => {
	test("parses --mode web", () => {
		const result = parseArgs(["--mode", "web"]);
		expect(result.mode).toBe("web");
	});

	test("parses --host", () => {
		const result = parseArgs(["--mode", "web", "--host", "0.0.0.0"]);
		expect(result.webHost).toBe("0.0.0.0");
	});

	test("parses --port as number", () => {
		const result = parseArgs(["--mode", "web", "--port", "8080"]);
		expect(result.webPort).toBe(8080);
	});

	test("ignores non-numeric --port", () => {
		const result = parseArgs(["--mode", "web", "--port", "abc"]);
		expect(result.webPort).toBeUndefined();
	});

	test("parses --open", () => {
		const result = parseArgs(["--mode", "web", "--open"]);
		expect(result.webOpen).toBe(true);
	});

	test("parses --web-token", () => {
		const result = parseArgs(["--mode", "web", "--web-token", "secret123"]);
		expect(result.webToken).toBe("secret123");
	});

	test("parses --serve-ui", () => {
		const result = parseArgs(["--mode", "web", "--serve-ui", "/path/to/ui"]);
		expect(result.serveUi).toBe("/path/to/ui");
	});

	test("all web flags together", () => {
		const result = parseArgs([
			"--mode",
			"web",
			"--host",
			"0.0.0.0",
			"--port",
			"9000",
			"--open",
			"--web-token",
			"tok",
			"--serve-ui",
			"./dist",
		]);
		expect(result.mode).toBe("web");
		expect(result.webHost).toBe("0.0.0.0");
		expect(result.webPort).toBe(9000);
		expect(result.webOpen).toBe(true);
		expect(result.webToken).toBe("tok");
		expect(result.serveUi).toBe("./dist");
	});

	test("web flags are undefined by default", () => {
		const result = parseArgs([]);
		expect(result.webHost).toBeUndefined();
		expect(result.webPort).toBeUndefined();
		expect(result.webOpen).toBeUndefined();
		expect(result.webToken).toBeUndefined();
		expect(result.serveUi).toBeUndefined();
	});

	test("web flags work alongside other flags", () => {
		const result = parseArgs([
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet",
			"--mode",
			"web",
			"--port",
			"5000",
			"--thinking",
			"high",
		]);
		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-sonnet");
		expect(result.mode).toBe("web");
		expect(result.webPort).toBe(5000);
		expect(result.thinking).toBe("high");
	});
});
