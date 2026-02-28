import { css } from "@linaria/core";
import { useState } from "react";
import { A2uiComponentRenderer } from "../A2uiComponentRenderer.js";
import type { A2uiComponentDef } from "../types.js";

const tabsRoot = css`
	display: flex;
	flex-direction: column;
`;

const tabBar = css`
	display: flex;
	border-bottom: 1px solid var(--color-oc-border);
	gap: 0;
`;

const tabButton = css`
	padding: 8px 16px;
	border: none;
	background: none;
	font-size: 0.875rem;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	border-bottom: 2px solid transparent;
	transition: color 100ms, border-color 100ms;

	&:hover {
		color: var(--color-oc-fg);
	}
`;

const tabButtonActive = css`
	color: var(--color-oc-primary);
	border-bottom-color: var(--color-oc-primary);
`;

const tabContent = css`
	padding: 12px 0;
`;

interface TabDef {
	label: string;
	contentId: string;
}

export function A2uiTabs({ def }: { def: A2uiComponentDef }) {
	const tabs = (def.tabs as TabDef[] | undefined) ?? [];
	const [activeIndex, setActiveIndex] = useState(0);

	if (tabs.length === 0) return null;

	const activeTab = tabs[activeIndex];

	return (
		<div className={tabsRoot}>
			<div className={tabBar}>
				{tabs.map((tab, index) => (
					<button
						key={tab.label}
						type="button"
						className={`${tabButton} ${index === activeIndex ? tabButtonActive : ""}`}
						onClick={() => setActiveIndex(index)}
					>
						{tab.label}
					</button>
				))}
			</div>
			<div className={tabContent}>
				{activeTab ? <A2uiComponentRenderer componentId={activeTab.contentId} /> : null}
			</div>
		</div>
	);
}
