// ---------------------------------------------------------------------------
// A2UI v0.9 message and component types (self-contained, no external dep)
// ---------------------------------------------------------------------------

/** A2UI v0.9 message — exactly one key is set. */
export interface A2uiMessage {
	createSurface?: { surfaceId: string; catalogId: string; theme?: unknown };
	updateComponents?: { surfaceId: string; components: A2uiComponentDef[] };
	updateDataModel?: { surfaceId: string; path?: string; value: unknown };
	deleteSurface?: { surfaceId: string };
}

export interface A2uiComponentDef {
	id: string;
	component: string;
	[key: string]: unknown;
}

/** Resolved string value — either a literal or a JSON Pointer path into the data model. */
export interface A2uiStringValue {
	literalString?: string;
	path?: string;
}

/** Resolved boolean value. */
export interface A2uiBooleanValue {
	literalBoolean?: boolean;
	path?: string;
}

/** Resolved number value. */
export interface A2uiNumberValue {
	literalNumber?: number;
	path?: string;
}

/** Children can be a static list of IDs or a dynamic template. */
export interface A2uiChildren {
	explicitList?: string[];
	template?: { dataBinding: string; componentId: string };
}

/** Action definition on interactive components. */
export interface A2uiAction {
	event?: { name: string; context?: Record<string, A2uiStringValue | A2uiBooleanValue | A2uiNumberValue> };
	functionCall?: { call: string; args?: Record<string, unknown> };
}
