import { css } from "@linaria/core";
import { useCallback } from "react";
import { useA2ui } from "../A2uiContext.js";
import { resolveString } from "../useDataBinding.js";
import type { A2uiComponentDef, A2uiStringValue } from "../types.js";

const mcWrapper = css`
	display: flex;
	flex-direction: column;
	gap: 4px;
`;

const mcLabel = css`
	font-size: 0.75rem;
	font-weight: 500;
	color: var(--color-oc-fg-muted);
`;

const optionWrapper = css`
	display: flex;
	align-items: center;
	gap: 8px;
`;

const optionInput = css`
	width: 16px;
	height: 16px;
	accent-color: var(--color-oc-primary);
	cursor: pointer;

	&:disabled {
		cursor: not-allowed;
	}
`;

const optionLabel = css`
	font-size: 0.875rem;
	color: var(--color-oc-fg);
`;

interface ChoiceOption {
	value: string;
	label: string;
}

export function A2uiMultipleChoice({ def }: { def: A2uiComponentDef }) {
	const { dataModel, dataBasePath, interactive } = useA2ui();
	const label = resolveString(def.label as A2uiStringValue | string | undefined, dataModel, dataBasePath);
	const options = (def.options as ChoiceOption[] | undefined) ?? [];
	const selectionsBinding = def.selections as { path?: string } | undefined;

	// Get current selections from data model
	let selections: string[] = [];
	if (selectionsBinding?.path) {
		const fullPath = dataBasePath === "/" ? selectionsBinding.path : `${dataBasePath}${selectionsBinding.path}`;
		const raw = dataModel.get(fullPath);
		if (Array.isArray(raw)) {
			selections = raw.map(String);
		}
	}

	const handleChange = useCallback(
		(optionValue: string, checked: boolean) => {
			if (!selectionsBinding?.path) return;
			const fullPath = dataBasePath === "/" ? selectionsBinding.path : `${dataBasePath}${selectionsBinding.path}`;
			const currentRaw = dataModel.get(fullPath);
			const current = Array.isArray(currentRaw) ? currentRaw.map(String) : [];
			const next = checked ? [...current, optionValue] : current.filter((v) => v !== optionValue);
			dataModel.set(fullPath, next);
		},
		[selectionsBinding, dataModel, dataBasePath],
	);

	return (
		<div className={mcWrapper}>
			{label ? <span className={mcLabel}>{label}</span> : null}
			{options.map((option) => (
				<label key={option.value} className={optionWrapper}>
					<input
						type="checkbox"
						className={optionInput}
						checked={selections.includes(option.value)}
						disabled={!interactive}
						onChange={(e) => handleChange(option.value, e.target.checked)}
					/>
					<span className={optionLabel}>{option.label}</span>
				</label>
			))}
		</div>
	);
}
