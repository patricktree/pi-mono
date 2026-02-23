import { css, cx } from "@linaria/core";
import { Menu } from "lucide-react";
import { sidebarIconBtn } from "../utils/helpers.js";

const headerStyle = css`
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 48px;
	padding: 0 12px;
	border-bottom: 1px solid var(--color-oc-border);
	background-color: var(--color-oc-card);
	flex-shrink: 0;
`;

const rightGroup = css`
	display: flex;
	align-items: center;
	gap: 8px;
`;

const statusBtn = css`
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 6px 14px;
	border: 1px solid var(--color-oc-border);
	border-radius: 9999px;
	background-color: var(--color-oc-card);
	font-size: 13px;
	font-weight: 500;
	color: var(--color-oc-fg);
	cursor: pointer;
	&:hover {
		background-color: var(--color-oc-muted-bg);
	}
`;

const statusDot = css`
	width: 8px;
	height: 8px;
	border-radius: 9999px;
`;

const statusDotConnected = css`
	background-color: var(--color-oc-accent);
`;

const statusDotDisconnected = css`
	background-color: var(--color-oc-error);
`;

const shareBtn = css`
	display: inline-flex;
	align-items: center;
	padding: 6px 14px;
	border: 1px solid var(--color-oc-border);
	border-radius: 0.5rem;
	background-color: var(--color-oc-card);
	font-size: 13px;
	font-weight: 500;
	color: var(--color-oc-fg);
	cursor: pointer;
	&:hover {
		background-color: var(--color-oc-muted-bg);
	}
`;

export function Header({
	connected,
	hasContent,
	onOpenSidebar,
}: {
	connected: boolean;
	hasContent: boolean;
	onOpenSidebar: () => void;
}) {
	return (
		<header className={headerStyle}>
			<button
				className={sidebarIconBtn}
				onClick={onOpenSidebar}
				type="button"
				aria-label="Open sidebar"
			>
				<Menu size={18} />
			</button>
			<div className={rightGroup}>
				<button className={statusBtn} type="button">
					<span className={cx(statusDot, connected ? statusDotConnected : statusDotDisconnected)} />
					Status
				</button>
				{hasContent ? (
					<button className={shareBtn} type="button">
						Share
					</button>
				) : null}
			</div>
		</header>
	);
}
