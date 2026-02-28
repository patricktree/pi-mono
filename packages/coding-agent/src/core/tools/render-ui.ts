import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";

const renderUiSchema = Type.Object({
	surface_id: Type.String({
		description: "Unique identifier for this UI surface (e.g. 'test-results', 'file-picker')",
	}),
	messages: Type.Array(Type.Record(Type.String(), Type.Unknown()), {
		description:
			"Array of A2UI v0.9 messages. Each message is an object with exactly one key: createSurface, updateComponents, updateDataModel, or deleteSurface.",
	}),
});

export type RenderUiToolInput = Static<typeof renderUiSchema>;

export type BroadcastFn = (data: object) => void;

const TOOL_DESCRIPTION = `Render an interactive UI surface in the user's browser using A2UI v0.9 format. Use for structured data displays, forms, selection UIs, dashboards, and approval workflows — whenever a visual layout communicates better than plain text.

The surface appears inline in the chat. Users can interact with buttons and forms; their actions arrive as follow-up messages.

A2UI v0.9 message types:
- createSurface: { surfaceId, catalogId: "standard" }
- updateComponents: { surfaceId, components: [{ id, component, ...properties }] }
  Components reference children by ID (flat adjacency list, not nested).
- updateDataModel: { surfaceId, path?, value }
  Components bind to data via JSON Pointer paths (e.g. "/items/0/name").
- deleteSurface: { surfaceId }

Standard catalog components: Text, Button, Card, Row, Column, List, TextField, CheckBox, Image, Tabs, Modal, Slider, Icon, Divider, DateTimeInput, MultipleChoice.

Component example (a card with title and action button):
messages: [
  { "createSurface": { "surfaceId": "demo", "catalogId": "standard" } },
  { "updateComponents": { "surfaceId": "demo", "components": [
    { "id": "root", "component": "Column", "children": ["title", "actions"] },
    { "id": "title", "component": "Text", "text": { "literalString": "Review Changes" }, "usageHint": "h2" },
    { "id": "actions", "component": "Row", "children": ["approve-btn", "reject-btn"] },
    { "id": "approve-btn", "component": "Button", "child": "approve-text", "action": { "event": { "name": "approve", "context": {} } } },
    { "id": "approve-text", "component": "Text", "text": { "literalString": "Approve" } },
    { "id": "reject-btn", "component": "Button", "child": "reject-text", "action": { "event": { "name": "reject", "context": {} } } },
    { "id": "reject-text", "component": "Text", "text": { "literalString": "Reject" } }
  ] } },
  { "updateDataModel": { "surfaceId": "demo", "value": {} } }
]

Data binding example (dynamic list):
{ "id": "name-text", "component": "Text", "text": { "path": "/name" } }
With updateDataModel: { "surfaceId": "s", "path": "/name", "value": "Alice" }

Keep using plain text/markdown for explanations. Use render_ui when visual structure adds value.`;

export function createRenderUiTool(broadcast: BroadcastFn, activeSurfaceIds: Set<string>): AgentTool {
	return {
		name: "render_ui",
		label: "render_ui",
		description: TOOL_DESCRIPTION,
		parameters: renderUiSchema,
		execute: async (_toolCallId: string, params: any) => {
			const { surface_id, messages } = params as { surface_id: string; messages: Record<string, unknown>[] };
			activeSurfaceIds.add(surface_id);
			broadcast({ type: "a2ui_surface_update", surfaceId: surface_id, messages });
			return {
				content: [{ type: "text" as const, text: `UI surface '${surface_id}' rendered successfully.` }],
				details: undefined,
			};
		},
	};
}
