import { css } from "@linaria/core";
import { useA2ui } from "../A2uiContext.js";
import { resolveString } from "../useDataBinding.js";
import type { A2uiComponentDef, A2uiStringValue } from "../types.js";

const iconStyle = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 1.25rem;
	color: var(--color-oc-fg-muted);
`;

export function A2uiIcon({ def }: { def: A2uiComponentDef }) {
	const { dataModel, dataBasePath } = useA2ui();
	const name = resolveString(def.name as A2uiStringValue | string | undefined, dataModel, dataBasePath);

	// Render as text — custom icon support can be added later
	return <span className={iconStyle}>{name || "●"}</span>;
}
