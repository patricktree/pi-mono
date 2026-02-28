import { css } from "@linaria/core";
import { useCallback } from "react";
import { useA2ui } from "../A2uiContext.js";
import { resolveNumber, resolveString } from "../useDataBinding.js";
import type { A2uiComponentDef, A2uiNumberValue, A2uiStringValue } from "../types.js";

const sliderWrapper = css`
	display: flex;
	flex-direction: column;
	gap: 4px;
`;

const sliderLabel = css`
	font-size: 0.75rem;
	font-weight: 500;
	color: var(--color-oc-fg-muted);
`;

const sliderInput = css`
	width: 100%;
	accent-color: var(--color-oc-primary);
	cursor: pointer;

	&:disabled {
		cursor: not-allowed;
	}
`;

const sliderValue = css`
	font-size: 0.75rem;
	color: var(--color-oc-fg-muted);
	text-align: right;
`;

export function A2uiSlider({ def }: { def: A2uiComponentDef }) {
	const { dataModel, dataBasePath, interactive } = useA2ui();
	const label = resolveString(def.label as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const value = resolveNumber(def.value as A2uiNumberValue | number | undefined, dataModel, dataBasePath);
	const min = (def.min as number) ?? 0;
	const max = (def.max as number) ?? 100;
	const step = (def.step as number) ?? 1;
	const valueBinding = def.value as A2uiNumberValue | undefined;

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (valueBinding && typeof valueBinding === "object" && valueBinding.path) {
				const fullPath = dataBasePath === "/" ? valueBinding.path : `${dataBasePath}${valueBinding.path}`;
				dataModel.set(fullPath, Number(e.target.value));
			}
		},
		[valueBinding, dataModel, dataBasePath],
	);

	return (
		<div className={sliderWrapper}>
			{label ? <label className={sliderLabel}>{label}</label> : null}
			<input
				type="range"
				className={sliderInput}
				value={value}
				min={min}
				max={max}
				step={step}
				disabled={!interactive}
				onChange={handleChange}
			/>
			<span className={sliderValue}>{value}</span>
		</div>
	);
}
