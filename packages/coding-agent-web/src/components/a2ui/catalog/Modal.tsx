import { css } from "@linaria/core";
import { useRenderChildren } from "../children.js";
import type { A2uiComponentDef } from "../types.js";

const modalOverlay = css`
	position: fixed;
	inset: 0;
	background-color: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
`;

const modalContent = css`
	background-color: var(--color-oc-bg);
	border-radius: var(--radius-oc);
	border: 1px solid var(--color-oc-border);
	padding: 20px;
	max-width: 90vw;
	max-height: 90vh;
	overflow-y: auto;
	min-width: 300px;
`;

export function A2uiModal({ def }: { def: A2uiComponentDef }) {
	const children = useRenderChildren(def);

	return (
		<div className={modalOverlay}>
			<div className={modalContent}>
				{children}
			</div>
		</div>
	);
}
