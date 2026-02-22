/**
 * Extension UI bridge for protocol-based transports (RPC stdio, WebSocket).
 *
 * Creates an ExtensionUIContext that serialises UI requests as protocol
 * messages and resolves them when the remote client responds.
 */

import * as crypto from "node:crypto";
import type {
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
} from "../../core/extensions/index.js";
import { type Theme, theme } from "../interactive/theme/theme.js";
import type { RpcExtensionUIRequest, RpcExtensionUIResponse } from "./types.js";

export type OutputFn = (obj: RpcExtensionUIRequest | object) => void;

export interface ExtensionUIBridge {
	/** The ExtensionUIContext for use with session.bindExtensions() */
	uiContext: ExtensionUIContext;
	/** Resolve a pending extension UI response from the remote client */
	resolveResponse(response: RpcExtensionUIResponse): void;
}

/**
 * Create an extension UI bridge that serialises requests over `output` and
 * waits for responses delivered via `resolveResponse()`.
 */
export function createExtensionUIBridge(output: OutputFn): ExtensionUIBridge {
	const pendingRequests = new Map<
		string,
		{ resolve: (value: RpcExtensionUIResponse) => void; reject: (error: Error) => void }
	>();

	function createDialogPromise<T>(
		opts: ExtensionUIDialogOptions | undefined,
		defaultValue: T,
		request: Record<string, unknown>,
		parseResponse: (response: RpcExtensionUIResponse) => T,
	): Promise<T> {
		if (opts?.signal?.aborted) return Promise.resolve(defaultValue);

		const id = crypto.randomUUID();
		return new Promise((resolve, reject) => {
			let timeoutId: ReturnType<typeof setTimeout> | undefined;

			const cleanup = () => {
				if (timeoutId) clearTimeout(timeoutId);
				opts?.signal?.removeEventListener("abort", onAbort);
				pendingRequests.delete(id);
			};

			const onAbort = () => {
				cleanup();
				resolve(defaultValue);
			};
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			if (opts?.timeout) {
				timeoutId = setTimeout(() => {
					cleanup();
					resolve(defaultValue);
				}, opts.timeout);
			}

			pendingRequests.set(id, {
				resolve: (response: RpcExtensionUIResponse) => {
					cleanup();
					resolve(parseResponse(response));
				},
				reject,
			});
			output({ type: "extension_ui_request", id, ...request } as RpcExtensionUIRequest);
		});
	}

	const uiContext: ExtensionUIContext = {
		select: (title, options, opts) =>
			createDialogPromise(opts, undefined, { method: "select", title, options, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
			),

		confirm: (title, message, opts) =>
			createDialogPromise(opts, false, { method: "confirm", title, message, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? false : "confirmed" in r ? r.confirmed : false,
			),

		input: (title, placeholder, opts) =>
			createDialogPromise(opts, undefined, { method: "input", title, placeholder, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
			),

		notify(message: string, type?: "info" | "warning" | "error"): void {
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "notify",
				message,
				notifyType: type,
			} as RpcExtensionUIRequest);
		},

		setStatus(key: string, text: string | undefined): void {
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "setStatus",
				statusKey: key,
				statusText: text,
			} as RpcExtensionUIRequest);
		},

		setWorkingMessage(_message?: string): void {
			// Not supported in protocol mode
		},

		setWidget(key: string, content: unknown, options?: ExtensionWidgetOptions): void {
			if (content === undefined || Array.isArray(content)) {
				output({
					type: "extension_ui_request",
					id: crypto.randomUUID(),
					method: "setWidget",
					widgetKey: key,
					widgetLines: content as string[] | undefined,
					widgetPlacement: options?.placement,
				} as RpcExtensionUIRequest);
			}
		},

		setFooter(_factory: unknown): void {
			// Not supported in protocol mode
		},

		setHeader(_factory: unknown): void {
			// Not supported in protocol mode
		},

		setTitle(title: string): void {
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "setTitle",
				title,
			} as RpcExtensionUIRequest);
		},

		async custom() {
			return undefined as never;
		},

		pasteToEditor(text: string): void {
			this.setEditorText(text);
		},

		setEditorText(text: string): void {
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "set_editor_text",
				text,
			} as RpcExtensionUIRequest);
		},

		getEditorText(): string {
			return "";
		},

		async editor(title: string, prefill?: string): Promise<string | undefined> {
			const id = crypto.randomUUID();
			return new Promise((resolve, reject) => {
				pendingRequests.set(id, {
					resolve: (response: RpcExtensionUIResponse) => {
						if ("cancelled" in response && response.cancelled) {
							resolve(undefined);
						} else if ("value" in response) {
							resolve(response.value);
						} else {
							resolve(undefined);
						}
					},
					reject,
				});
				output({ type: "extension_ui_request", id, method: "editor", title, prefill } as RpcExtensionUIRequest);
			});
		},

		setEditorComponent(): void {
			// Not supported in protocol mode
		},

		get theme() {
			return theme;
		},

		getAllThemes() {
			return [];
		},

		getTheme(_name: string) {
			return undefined;
		},

		setTheme(_theme: string | Theme) {
			return { success: false, error: "Theme switching not supported in protocol mode" };
		},

		getToolsExpanded() {
			return false;
		},

		setToolsExpanded(_expanded: boolean) {
			// Not supported in protocol mode
		},

		onTerminalInput(): () => void {
			// Raw terminal input not supported in protocol mode
			return () => {};
		},
	};

	return {
		uiContext,
		resolveResponse(response: RpcExtensionUIResponse): void {
			const pending = pendingRequests.get(response.id);
			if (pending) {
				pendingRequests.delete(response.id);
				pending.resolve(response);
			}
		},
	};
}
