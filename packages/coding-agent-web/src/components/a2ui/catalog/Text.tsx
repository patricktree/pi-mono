import { css } from "@linaria/core";
import { useA2ui } from "../A2uiContext.js";
import { resolveString } from "../useDataBinding.js";
import type { A2uiComponentDef, A2uiStringValue } from "../types.js";

const textBase = css`
	color: inherit;
	line-height: 1.5;
`;

const h1Style = css`
	font-size: 1.25rem;
	font-weight: 700;
	margin: 0.4rem 0;
`;

const h2Style = css`
	font-size: 1.125rem;
	font-weight: 600;
	margin: 0.3rem 0;
`;

const h3Style = css`
	font-size: 1rem;
	font-weight: 600;
	margin: 0.2rem 0;
`;

const bodyStyle = css`
	font-size: 0.875rem;
`;

const captionStyle = css`
	font-size: 0.75rem;
	color: var(--color-oc-fg-muted);
`;

function getHintClass(hint: string | undefined): string {
	switch (hint) {
		case "h1":
			return h1Style;
		case "h2":
			return h2Style;
		case "h3":
			return h3Style;
		case "caption":
			return captionStyle;
		default:
			return bodyStyle;
	}
}

export function A2uiText({ def }: { def: A2uiComponentDef }) {
	const { dataModel, dataBasePath } = useA2ui();
	const text = resolveString(def.text as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const usageHint = def.usageHint as string | undefined;

	return <span className={`${textBase} ${getHintClass(usageHint)}`}>{text}</span>;
}
