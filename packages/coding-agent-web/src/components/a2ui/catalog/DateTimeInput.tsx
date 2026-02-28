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

export function A2uiDateTimeInput({ def }: { def: A2uiComponentDef }) {
	const { dataModel, dataBasePath, interactive } = useA2ui();
	const label = resolveString(def.label as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const value = resolveString(def.value as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const valueBinding = def.value as A2uiStringValue | undefined;
	const inputType = (def.inputType as string) ?? "datetime-local";

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (valueBinding && typeof valueBinding === "object" && valueBinding.path) {
				const fullPath = dataBasePath === "/" ? valueBinding.path : `${dataBasePath}${valueBinding.path}`;
				dataModel.set(fullPath, e.target.value);
			}
		},
		[valueBinding, dataModel, dataBasePath],
	);

	return (
		<div className={fieldWrapper}>
			{label ? <label className={labelStyle}>{label}</label> : null}
			<input
				type={inputType}
				className={inputStyle}
				value={value}
				disabled={!interactive}
				onChange={handleChange}
			/>
		</div>
	);
}
