import { css } from "@linaria/core";
import { useRenderChildren } from "../children.js";
import type { A2uiComponentDef } from "../types.js";

const listStyle = css`
	display: flex;
	flex-direction: column;
	gap: 4px;
`;

export function A2uiList({ def }: { def: A2uiComponentDef }) {
	const children = useRenderChildren(def);
	return <div className={listStyle}>{children}</div>;
}
