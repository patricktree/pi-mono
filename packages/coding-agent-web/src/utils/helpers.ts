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

/** Reusable class strings for repeated button patterns. */
export const SIDEBAR_ICON_BTN =
	"inline-flex items-center justify-center w-9 h-9 rounded-lg text-oc-fg-muted cursor-pointer hover:bg-oc-muted-bg hover:text-oc-fg";
export const ICON_BTN =
	"inline-flex items-center justify-center w-8 h-8 rounded-md text-oc-fg-muted cursor-pointer shrink-0 hover:bg-oc-muted-bg hover:text-oc-fg disabled:opacity-40 disabled:cursor-default";
export const TOOLBAR_ITEM =
	"inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[13px] font-medium text-oc-fg-muted cursor-pointer whitespace-nowrap hover:text-oc-fg hover:bg-oc-muted-bg [&_svg]:shrink-0";
