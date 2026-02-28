import { css } from "@linaria/core";
import { useRenderChildren } from "../children.js";
import type { A2uiComponentDef } from "../types.js";

const columnStyle = css`
	display: flex;
	flex-direction: column;
	gap: 8px;
`;

export function A2uiColumn({ def }: { def: A2uiComponentDef }) {
	const children = useRenderChildren(def);
	return <div className={columnStyle}>{children}</div>;
}
