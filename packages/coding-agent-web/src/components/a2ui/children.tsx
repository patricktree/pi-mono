import type { ReactNode } from "react";
import { A2uiComponentRenderer } from "./A2uiComponentRenderer.js";
import { useA2ui } from "./A2uiContext.js";
import type { A2uiComponentDef } from "./types.js";

/**
 * Render children of a container component.
 * Supports: string[] (shorthand), { explicitList: string[] }, and { template: ... }.
 */
export function useRenderChildren(def: A2uiComponentDef): ReactNode[] {
	const { dataModel, dataBasePath } = useA2ui();
	const children = def.children as string[] | { explicitList?: string[]; template?: { dataBinding: string; componentId: string } } | undefined;

	if (!children) return [];

	// Shorthand: direct string array
	if (Array.isArray(children)) {
		return children.map((id) => <A2uiComponentRenderer key={id} componentId={id} />);
	}

	// Explicit list
	if (children.explicitList) {
		return children.explicitList.map((id) => <A2uiComponentRenderer key={id} componentId={id} />);
	}

	// Dynamic template
	if (children.template) {
		const { dataBinding, componentId } = children.template;
		const fullPath = dataBasePath === "/" ? dataBinding : `${dataBasePath}${dataBinding}`;
		const items = dataModel.get(fullPath);
		if (!Array.isArray(items)) return [];
		return items.map((_, index) => (
			<A2uiComponentRenderer key={`${componentId}-${index}`} componentId={componentId} />
		));
	}

	return [];
}

/**
 * Render a single child component.
 */
export function RenderChild({ childId }: { childId: string | undefined }) {
	if (!childId) return null;
	return <A2uiComponentRenderer componentId={childId} />;
}
