import { css } from "@linaria/core";
import type { UiMessage } from "../state/store.js";

const LOG_PREFIX = "[pi-web]";

export function log(...args: unknown[]): void {
	console.log(LOG_PREFIX, ...args);
}

export function warn(...args: unknown[]): void {
	console.warn(LOG_PREFIX, ...args);
}

export function error(...args: unknown[]): void {
	console.error(LOG_PREFIX, ...args);
}

export interface Turn {
	user: UiMessage;
	steps: UiMessage[];
}

export function lastUserMessage(messages: UiMessage[]): UiMessage | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index].kind === "user") return messages[index];
	}
	return undefined;
}

export function groupTurns(messages: UiMessage[]): { orphans: UiMessage[]; turns: Turn[] } {
	const orphans: UiMessage[] = [];
	const turns: Turn[] = [];
	let current: Turn | null = null;

	for (const message of messages) {
		if (message.kind === "user") {
			current = { user: message, steps: [] };
			turns.push(current);
			continue;
		}
		if (!current) {
			orphans.push(message);
			continue;
		}
		current.steps.push(message);
	}

	return { orphans, turns };
}

export function isTouchDevice(): boolean {
	return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function shortenPath(cwd: string): string {
	return cwd.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

export function timeAgo(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function getWebSocketUrl(): string {
	const params = new URLSearchParams(window.location.search);
	const token = params.get("token");
	const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : "";
	return `${wsProtocol}//${window.location.host}/ws${tokenSuffix}`;
}

/** Read session ID from the URL query parameter. */
export function getSessionFromUrl(): string | null {
	const params = new URLSearchParams(window.location.search);
	return params.get("session");
}

/** Update the session ID in the URL without a full page reload. */
export function setSessionInUrl(sessionId: string | null): void {
	const url = new URL(window.location.href);
	if (sessionId) {
		url.searchParams.set("session", sessionId);
	} else {
		url.searchParams.delete("session");
	}
	window.history.replaceState({}, "", url.toString());
}

export function readFileAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Failed to read file as base64"));
				return;
			}
			const base64 = result.split(",")[1];
			if (!base64) {
				reject(new Error("Failed to read file as base64"));
				return;
			}
			resolve(base64);
		};
		reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
		reader.readAsDataURL(file);
	});
}

/** Derive a session title from the first user message. */
export function deriveSessionTitle(messages: UiMessage[]): string | undefined {
	for (const msg of messages) {
		if (msg.kind === "user" && msg.text.trim()) {
			const text = msg.text.trim();
			return text;
		}
	}
	return undefined;
}

/** Reusable style classes for repeated button patterns. */
export const sidebarIconBtn = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border-radius: 0.5rem;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
`;

export const iconBtn = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border-radius: 0.375rem;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	flex-shrink: 0;
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
	&:disabled {
		opacity: 0.4;
		cursor: default;
	}
`;
