import { css } from "@linaria/core";
import { RenderChild } from "../children.js";
import type { A2uiComponentDef } from "../types.js";

const cardStyle = css`
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	background-color: var(--color-oc-card);
	padding: 12px 16px;
	overflow: hidden;
`;

export function A2uiCard({ def }: { def: A2uiComponentDef }) {
	const childId = def.child as string | undefined;
	return (
		<div className={cardStyle}>
			<RenderChild childId={childId} />
		</div>
	);
}
