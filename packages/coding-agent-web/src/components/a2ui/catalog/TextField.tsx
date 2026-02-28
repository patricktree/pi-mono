import { css } from "@linaria/core";
import { useCallback } from "react";
import { useA2ui } from "../A2uiContext.js";
import { resolveString } from "../useDataBinding.js";
import type { A2uiComponentDef, A2uiStringValue } from "../types.js";

const fieldWrapper = css`
	display: flex;
	flex-direction: column;
	gap: 4px;
`;

const labelStyle = css`
	font-size: 0.75rem;
	font-weight: 500;
	color: var(--color-oc-fg-muted);
`;

const inputStyle = css`
	padding: 8px 12px;
	border-radius: var(--radius-oc);
	border: 1px solid var(--color-oc-border);
	background-color: var(--color-oc-bg);
	color: var(--color-oc-fg);
	font-size: 0.875rem;
	outline: none;

	&:focus {
		border-color: var(--color-oc-ring);
	}

	&:disabled {
		opacity: 0.5;
	}
`;

export function A2uiTextField({ def }: { def: A2uiComponentDef }) {
	const { dataModel, dataBasePath, interactive } = useA2ui();
	const label = resolveString(def.label as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const text = resolveString(def.text as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const textValue = def.text as A2uiStringValue | undefined;
	const placeholder = resolveString(def.placeholder as A2uiStringValue | string | undefined, dataModel, dataBasePath);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			// Write back to data model if bound via path
			if (textValue?.path) {
				const fullPath = dataBasePath === "/" ? textValue.path : `${dataBasePath}${textValue.path}`;
				dataModel.set(fullPath, e.target.value);
			}
		},
		[textValue, dataModel, dataBasePath],
	);

	return (
		<div className={fieldWrapper}>
			{label ? <label className={labelStyle}>{label}</label> : null}
			<input
				type="text"
				className={inputStyle}
				value={text}
				placeholder={placeholder}
				disabled={!interactive}
				onChange={handleChange}
			/>
		</div>
	);
}
