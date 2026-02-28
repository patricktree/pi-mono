import { css } from "@linaria/core";
import { useCallback } from "react";
import { useA2ui } from "../A2uiContext.js";
import { useRenderChildren } from "../children.js";
import { resolveString } from "../useDataBinding.js";
import type { A2uiAction, A2uiComponentDef, A2uiStringValue } from "../types.js";

const buttonStyle = css`
	display: inline-flex;
	align-items: center;
	align-self: flex-start;
	justify-content: center;
	gap: 6px;
	height: 36px;
	padding: 8px 16px;
	border-radius: 0.375rem;
	border: none;
	background-color: var(--color-oc-primary);
	color: var(--color-oc-primary-fg);
	font-size: 0.875rem;
	font-weight: 500;
	cursor: pointer;
	box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
	transition: opacity 100ms;

	&:hover {
		opacity: 0.9;
	}

	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
`;

export function A2uiButton({ def }: { def: A2uiComponentDef }) {
	const { interactive, onAction, dataModel, dataBasePath } = useA2ui();
	const action = def.action as A2uiAction | undefined;
	const children = useRenderChildren(def);
	// Support inline label text (LLMs may skip the child Text component)
	const label = resolveString(def.label as A2uiStringValue | string | undefined, dataModel, dataBasePath);

	const handleClick = useCallback(() => {
		if (!interactive || !action) return;
		onAction(action);
	}, [interactive, action, onAction]);

	return (
		<button type="button" className={buttonStyle} disabled={!interactive} onClick={handleClick}>
			{children.length > 0 ? children : label || null}
		</button>
	);
}
