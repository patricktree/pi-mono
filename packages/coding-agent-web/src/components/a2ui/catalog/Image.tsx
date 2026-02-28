import { css } from "@linaria/core";
import { useA2ui } from "../A2uiContext.js";
import { resolveString } from "../useDataBinding.js";
import type { A2uiComponentDef, A2uiStringValue } from "../types.js";

const imageStyle = css`
	max-width: 100%;
	height: auto;
	border-radius: var(--radius-oc);
`;

export function A2uiImage({ def }: { def: A2uiComponentDef }) {
	const { dataModel, dataBasePath } = useA2ui();
	const src = resolveString(def.src as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const alt = resolveString(def.alt as A2uiStringValue | string | undefined, dataModel, dataBasePath);

	if (!src) return null;

	return <img className={imageStyle} src={src} alt={alt || ""} />;
}
