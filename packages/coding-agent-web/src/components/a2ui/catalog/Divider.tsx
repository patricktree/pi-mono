import { css } from "@linaria/core";
import type { A2uiComponentDef } from "../types.js";

const dividerStyle = css`
	border: none;
	border-top: 1px solid var(--color-oc-border);
	margin: 8px 0;
`;

export function A2uiDivider({ def: _def }: { def: A2uiComponentDef }) {
	return <hr className={dividerStyle} />;
}
