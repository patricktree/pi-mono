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

interface NormalizedTab {
	label: string;
	contentId: string;
}

/**
 * Normalize a raw tab definition from the LLM. Accepts several property
 * name variations that models commonly produce.
 */
function normalizeTab(raw: Record<string, unknown>): NormalizedTab | undefined {
	const label = (raw.label ?? raw.title ?? raw.name) as string | undefined;
	const contentId = (raw.contentId ?? raw.content ?? raw.child ?? raw.panelId ?? raw.componentId) as
		| string
		| undefined;
	if (!label || !contentId) return undefined;
	return { label, contentId };
}

/**
 * Build the tabs list from whichever property the LLM provided.
 * Supports `tabs`, `items`, and paired `children`/`labels` arrays.
 */
function resolveTabs(def: A2uiComponentDef): NormalizedTab[] {
	// Primary: `tabs` or `items` array of objects
	const rawTabs = (def.tabs ?? def.items) as Record<string, unknown>[] | undefined;
	if (Array.isArray(rawTabs) && rawTabs.length > 0) {
		const result: NormalizedTab[] = [];
		for (const raw of rawTabs) {
			const tab = normalizeTab(raw);
			if (tab) result.push(tab);
		}
		if (result.length > 0) return result;
	}

	// Fallback: parallel `labels` + `children` arrays
	const labels = def.labels as string[] | undefined;
	const children = def.children as string[] | undefined;
	if (Array.isArray(labels) && Array.isArray(children)) {
		const len = Math.min(labels.length, children.length);
		const result: NormalizedTab[] = [];
		for (let i = 0; i < len; i++) {
			result.push({ label: labels[i], contentId: children[i] });
		}
		if (result.length > 0) return result;
	}

	return [];
}

export function A2uiTabs({ def }: { def: A2uiComponentDef }) {
	const tabs = resolveTabs(def);
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
