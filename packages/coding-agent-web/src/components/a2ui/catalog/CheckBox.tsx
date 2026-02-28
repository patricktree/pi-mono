import { css } from "@linaria/core";
import { useCallback } from "react";
import { useA2ui } from "../A2uiContext.js";
import { resolveBoolean, resolveString } from "../useDataBinding.js";
import type { A2uiBooleanValue, A2uiComponentDef, A2uiStringValue } from "../types.js";

const checkboxWrapper = css`
	display: flex;
	align-items: center;
	gap: 8px;
`;

const checkboxInput = css`
	width: 16px;
	height: 16px;
	accent-color: var(--color-oc-primary);
	cursor: pointer;

	&:disabled {
		cursor: not-allowed;
	}
`;

const checkboxLabel = css`
	font-size: 0.875rem;
	color: var(--color-oc-fg);
`;

export function A2uiCheckBox({ def }: { def: A2uiComponentDef }) {
	const { dataModel, dataBasePath, interactive } = useA2ui();
	const label = resolveString(def.label as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const checked = resolveBoolean(def.value as A2uiBooleanValue | boolean | undefined, dataModel, dataBasePath);
	const valueBinding = def.value as A2uiBooleanValue | undefined;

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (valueBinding && typeof valueBinding === "object" && valueBinding.path) {
				const fullPath = dataBasePath === "/" ? valueBinding.path : `${dataBasePath}${valueBinding.path}`;
				dataModel.set(fullPath, e.target.checked);
			}
		},
		[valueBinding, dataModel, dataBasePath],
	);

	return (
		<label className={checkboxWrapper}>
			<input
				type="checkbox"
				className={checkboxInput}
				checked={checked}
				disabled={!interactive}
				onChange={handleChange}
			/>
			{label ? <span className={checkboxLabel}>{label}</span> : null}
		</label>
	);
}
