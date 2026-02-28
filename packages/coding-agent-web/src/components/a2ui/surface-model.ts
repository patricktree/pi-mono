// ---------------------------------------------------------------------------
// Surface model — processes A2UI messages into component + data state
// ---------------------------------------------------------------------------

import { DataModel } from "./data-model.js";
import type { A2uiComponentDef, A2uiMessage } from "./types.js";

export interface SurfaceState {
	components: Map<string, A2uiComponentDef>;
	rootId: string | undefined;
	dataModel: DataModel;
}

/**
 * Process an array of A2UI v0.9 messages into a SurfaceState.
 * Handles createSurface, updateComponents, updateDataModel, deleteSurface.
 */
export function buildSurfaceState(messages: unknown[]): SurfaceState {
	const components = new Map<string, A2uiComponentDef>();
	const dataModel = new DataModel();
	let rootId: string | undefined;

	for (const raw of messages) {
		const msg = raw as A2uiMessage;

		if (msg.updateComponents) {
			for (const comp of msg.updateComponents.components) {
				components.set(comp.id, comp);
				// First component without a known parent becomes root candidate
				if (!rootId) {
					rootId = comp.id;
				}
			}
		}

		if (msg.updateDataModel) {
			dataModel.set(msg.updateDataModel.path, msg.updateDataModel.value);
		}

		// deleteSurface is handled at the store level (removes the UiMessage entirely)
	}

	// Try to detect the root: look for a component named "root" or one with children
	// that isn't referenced as a child by another component.
	const childIds = new Set<string>();
	for (const comp of components.values()) {
		const children = resolveChildIds(comp);
		for (const childId of children) {
			childIds.add(childId);
		}
		const child = comp.child as string | undefined;
		if (child) {
			childIds.add(child);
		}
	}

	// Prefer "root" ID, then first component that isn't a child of anything
	if (components.has("root")) {
		rootId = "root";
	} else {
		for (const id of components.keys()) {
			if (!childIds.has(id)) {
				rootId = id;
				break;
			}
		}
	}

	return { components, rootId, dataModel };
}

/** Extract child IDs from a component's children property. */
function resolveChildIds(comp: A2uiComponentDef): string[] {
	const children = comp.children as string[] | { explicitList?: string[] } | undefined;
	if (!children) return [];
	if (Array.isArray(children)) return children;
	if (children.explicitList) return children.explicitList;
	return [];
}
