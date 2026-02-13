/**
 * Web mode: HTTP + WebSocket server for browser-based agent interaction.
 *
 * Reuses the shared protocol server core (same command handling as RPC mode)
 * but transports over WebSocket instead of stdio.
 */

import { exec } from "node:child_process";
import { platform } from "node:os";
import type { AgentSession } from "../../core/agent-session.js";
import { createProtocolServerCore } from "../protocol/server-core.js";
import type { RpcCommand, RpcExtensionUIResponse } from "../protocol/types.js";
import { createHttpServer } from "./http-server.js";
import { createWebSocketServer } from "./ws-transport.js";

// ============================================================================
// Types
// ============================================================================

export interface WebModeOptions {
	host: string;
	port: number;
	/** Open browser automatically after starting */
	open: boolean;
	/** Optional auth token */
	token?: string;
	/** Path to custom static UI build directory */
	serveUiPath?: string;
}

// ============================================================================
// Entry point
// ============================================================================

/**
 * Run in web mode.
 * Starts an HTTP server that serves a UI and a WebSocket endpoint for the protocol.
 */
export async function runWebMode(session: AgentSession, options: WebModeOptions): Promise<never> {
	const { host, port, open, token, serveUiPath } = options;

	// Security warning for public binding
	if (host === "0.0.0.0") {
		console.warn("\x1b[33m⚠ WARNING: Binding to 0.0.0.0 exposes this server to all network interfaces.\x1b[0m");
		if (!token) {
			console.warn("\x1b[33m  Consider using --web-token to require authentication.\x1b[0m");
		}
	}

	// Create WebSocket server
	const allowedOrigins: string[] = [];
	if (host === "127.0.0.1" || host === "localhost") {
		allowedOrigins.push(`http://${host}:${port}`, `http://localhost:${port}`, `http://127.0.0.1:${port}`);
	}

	const wsServer = createWebSocketServer({
		token,
		allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
	});

	// Create protocol server core with broadcast output
	const core = createProtocolServerCore({
		session,
		output: (obj) => wsServer.broadcast(obj),
	});

	// Bind extensions and subscribe to events
	await core.bind();

	// Handle incoming WebSocket messages
	wsServer.onMessage(async (client, data) => {
		if (!data || typeof data !== "object") return;

		const parsed = data as Record<string, unknown>;

		// Handle extension UI responses
		if (parsed.type === "extension_ui_response") {
			core.handleExtensionUIResponse(parsed as unknown as RpcExtensionUIResponse);
			return;
		}

		// Handle regular commands
		const command = parsed as unknown as RpcCommand;
		const response = await core.handleCommand(command);
		// Send response only to the requesting client
		client.send(response);

		// Check for shutdown
		if (core.shutdownRequested) {
			const currentRunner = session.extensionRunner;
			if (currentRunner?.hasHandlers("session_shutdown")) {
				await currentRunner.emit({ type: "session_shutdown" });
			}
			await httpServer.close();
			process.exit(0);
		}
	});

	wsServer.onClose((_client) => {
		// Client disconnected – nothing specific to do in single-session mode
	});

	// Create and start HTTP server
	const httpServer = createHttpServer({
		host,
		port,
		serveUiPath,
		wsServer,
		token,
	});

	const boundPort = await httpServer.listen();
	const displayHost = host === "0.0.0.0" ? "localhost" : host;
	const url = `http://${displayHost}:${boundPort}`;
	const wsUrl = `ws://${displayHost}:${boundPort}/ws${token ? `?token=${token}` : ""}`;

	console.log(`\x1b[1mpi web mode\x1b[0m`);
	console.log(`  UI:        ${url}`);
	console.log(`  WebSocket: ${wsUrl}`);
	if (token) {
		console.log(`  Token:     ${token}`);
	}
	console.log();

	// Open browser if requested
	if (open) {
		openBrowser(url);
	}

	// Keep process alive
	return new Promise(() => {});
}

// ============================================================================
// Helpers
// ============================================================================

function openBrowser(url: string): void {
	const plat = platform();
	let cmd: string;
	if (plat === "darwin") {
		cmd = `open "${url}"`;
	} else if (plat === "win32") {
		cmd = `start "" "${url}"`;
	} else {
		cmd = `xdg-open "${url}"`;
	}
	exec(cmd, (err) => {
		if (err) {
			console.warn(`Could not open browser: ${err.message}`);
		}
	});
}
