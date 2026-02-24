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

const statusIndicator = css`
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

export function Header({
	connected,
	onOpenSidebar,
}: {
	connected: boolean;
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
				<span className={statusIndicator}>
					<span className={cx(statusDot, connected ? statusDotConnected : statusDotDisconnected)} />
					{connected ? "Connected" : "Disconnected"}
				</span>
			</div>
		</header>
	);
}
