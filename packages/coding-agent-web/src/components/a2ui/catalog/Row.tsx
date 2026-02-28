import { css } from "@linaria/core";
import { useRenderChildren } from "../children.js";
import type { A2uiComponentDef } from "../types.js";

const rowStyle = css`
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
`;

export function A2uiRow({ def }: { def: A2uiComponentDef }) {
	const children = useRenderChildren(def);
	return <div className={rowStyle}>{children}</div>;
}
