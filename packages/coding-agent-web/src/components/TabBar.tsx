import { css, cx } from "@linaria/core";

export type TabId = "session" | "changes";

const tabBarStyle = css`
	display: flex;
	border-bottom: 1px solid var(--color-oc-border);
	background-color: var(--color-oc-card);
	flex-shrink: 0;
`;

const tabBtn = css`
	flex: 1 1 0%;
	padding: 10px 0;
	font-size: 0.875rem;
	font-weight: 500;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	text-align: center;
	border-bottom: 2px solid transparent;
	margin-bottom: -1px;
	&:hover {
		color: var(--color-oc-fg);
	}
`;

const tabBtnActive = css`
	color: var(--color-oc-fg);
	border-bottom-color: var(--color-oc-fg);
`;

export function TabBar({
	activeTab,
	onTabChange,
}: {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
}) {
	return (
		<div className={tabBarStyle}>
			<button
				className={cx(tabBtn, activeTab === "session" && tabBtnActive)}
				onClick={() => onTabChange("session")}
				type="button"
			>
				Session
			</button>
			<button
				className={cx(tabBtn, activeTab === "changes" && tabBtnActive)}
				onClick={() => onTabChange("changes")}
				type="button"
			>
				Changes
			</button>
		</div>
	);
}
