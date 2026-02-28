import { css } from "@linaria/core";
import { useCallback, useMemo } from "react";
import type { A2uiSurfaceData } from "../../state/store.js";
import { A2uiComponentRenderer } from "./A2uiComponentRenderer.js";
import { A2uiContext, type A2uiContextValue } from "./A2uiContext.js";
import { buildSurfaceState } from "./surface-model.js";
import type { A2uiAction } from "./types.js";

const surfaceRoot = css`
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	background-color: var(--color-oc-card);
	color: var(--color-oc-fg);
	padding: 16px;
	overflow: hidden;
`;

const disabledOverlay = css`
	opacity: 0.7;
	pointer-events: none;
`;

export function A2uiSurface({
	data,
	onAction,
}: {
	data: A2uiSurfaceData;
	onAction: (surfaceId: string, action: A2uiAction) => void;
}) {
	// Rebuild surface state when messages change (revision acts as cache-buster)
	const surface = useMemo(() => buildSurfaceState(data.messages), [data.messages, data.revision]);

	const handleAction = useCallback(
		(action: A2uiAction) => {
			onAction(data.surfaceId, action);
		},
		[data.surfaceId, onAction],
	);

	const ctx: A2uiContextValue = useMemo(
		() => ({
			components: surface.components,
			dataModel: surface.dataModel,
			interactive: data.interactive,
			dataBasePath: "/",
			onAction: handleAction,
		}),
		[surface.components, surface.dataModel, data.interactive, handleAction],
	);

	if (!surface.rootId) {
		return null;
	}

	return (
		<A2uiContext.Provider value={ctx}>
			<div className={`${surfaceRoot} ${data.interactive ? "" : disabledOverlay}`}>
				<A2uiComponentRenderer componentId={surface.rootId} />
			</div>
		</A2uiContext.Provider>
	);
}
