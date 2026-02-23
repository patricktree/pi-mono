import { css, cx } from "@linaria/core";
import { ClipboardList, HelpCircle, MoreHorizontal, Plus, Settings } from "lucide-react";
import type { SessionSummary } from "../protocol/types.js";
import { iconBtn, sidebarIconBtn, shortenPath } from "../utils/helpers.js";

const overlay = css`
	position: fixed;
	inset: 0;
	z-index: 40;
	pointer-events: none;
	transition: background-color 200ms, backdrop-filter 200ms;
`;

const overlayOpen = css`
	background-color: rgba(0, 0, 0, 0.2);
	backdrop-filter: blur(1px);
	pointer-events: auto;
`;

const aside = css`
	position: fixed;
	top: 0;
	bottom: 0;
	left: 0;
	z-index: 50;
	width: 356px;
	max-width: 90vw;
	background-color: var(--color-oc-card);
	border-right: 1px solid var(--color-oc-border);
	display: flex;
	flex-direction: row;
	transform: translateX(-100%);
	transition: transform 250ms ease-in-out;
`;

const asideOpen = css`
	transform: translateX(0);
`;

const iconStripStyle = css`
	width: 56px;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 16px 0;
	gap: 4px;
	border-right: 1px solid var(--color-oc-border-light);
`;

const iconStripTop = css`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
`;

const logoBox = css`
	width: 36px;
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 2px solid var(--color-oc-fg);
	border-radius: 0.5rem;
	margin-bottom: 4px;
`;

const iconStripBottom = css`
	margin-top: auto;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
`;

const contentPanel = css`
	flex: 1 1 0%;
	min-width: 0;
	display: flex;
	flex-direction: column;
	overflow: hidden;
`;

const contentHeader = css`
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	padding: 16px 16px 12px;
`;

const titleGroup = css`
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
`;

const titleText = css`
	font-weight: 600;
	font-size: 15px;
`;

const subtitleText = css`
	font-size: 0.75rem;
	line-height: 1rem;
	color: var(--color-oc-fg-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
`;

const newSessionBtn = css`
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0 12px 8px;
	padding: 8px 12px;
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	background-color: var(--color-oc-card);
	font-size: 0.875rem;
	font-weight: 500;
	cursor: pointer;
	justify-content: center;
	&:hover {
		background-color: var(--color-oc-muted-bg);
	}
`;

const sessionList = css`
	flex: 1 1 0%;
	min-height: 0;
	overflow-y: auto;
	padding: 0 8px;
`;

const emptyMsg = css`
	padding: 8px 12px;
	font-size: 13px;
	color: var(--color-oc-fg-muted);
`;

const sessionItem = css`
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 6px 12px;
	border-radius: 0.375rem;
	text-align: left;
	font-size: 13px;
	color: var(--color-oc-fg);
	cursor: pointer;
	&:hover {
		background-color: var(--color-oc-muted-bg);
	}
`;

const sessionItemActive = css`
	background-color: var(--color-oc-muted-bg);
`;

const sessionDash = css`
	color: var(--color-oc-fg-faint);
	flex-shrink: 0;
`;

const sessionName = css`
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	flex: 1 1 0%;
	min-width: 0;
`;

const sessionIcon = css`
	flex-shrink: 0;
	color: var(--color-oc-fg-faint);
`;

export function Sidebar({
	open,
	sessions,
	currentSessionId,
	currentCwd,
	onClose,
	onNewSession,
	onSwitchSession,
}: {
	open: boolean;
	sessions: SessionSummary[];
	currentSessionId: string | null;
	currentCwd: string | undefined;
	onClose: () => void;
	onNewSession: () => void;
	onSwitchSession: (session: SessionSummary) => void;
}) {
	return (
		<>
			{/* Sidebar overlay */}
			<div
				className={cx(overlay, open && overlayOpen)}
				onClick={onClose}
			/>

			{/* Sidebar */}
			<aside className={cx(aside, open && asideOpen)}>
				{/* Left icon strip */}
				<div className={iconStripStyle}>
					<div className={iconStripTop}>
						<div className={logoBox}>
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="3" y="3" width="18" height="18" rx="4" />
								<rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" />
							</svg>
						</div>
						<button className={sidebarIconBtn} onClick={onNewSession} type="button" aria-label="New session">
							<Plus size={18} />
						</button>
					</div>
					<div className={iconStripBottom}>
						<button className={sidebarIconBtn} type="button" aria-label="Settings">
							<Settings size={18} />
						</button>
						<button className={sidebarIconBtn} type="button" aria-label="Help">
							<HelpCircle size={18} />
						</button>
					</div>
				</div>

				{/* Right content panel */}
				<div className={contentPanel}>
					<div className={contentHeader}>
						<div className={titleGroup}>
							<span className={titleText}>pi</span>
							<span className={subtitleText}>{currentCwd ? shortenPath(currentCwd) : "~/workspace"}</span>
						</div>
						<button className={iconBtn} type="button">
							<MoreHorizontal size={16} />
						</button>
					</div>

					<button
						className={newSessionBtn}
						onClick={onNewSession}
						type="button"
					>
						<Plus size={16} />
						New session
					</button>

					<div className={sessionList}>
						{sessions.length === 0 ? (
							<p className={emptyMsg}>No sessions yet</p>
						) : null}
						{sessions.map((session) => {
							const displayName = session.name ?? session.firstMessage;
							const truncated = displayName.length > 20 ? `${displayName.slice(0, 20)}...` : displayName;
							const active = session.id === currentSessionId;
							return (
								<button
									className={cx(sessionItem, active && sessionItemActive)}
									onClick={() => onSwitchSession(session)}
									type="button"
									key={session.id}
								>
									<span className={sessionDash}>—</span>
									<span className={sessionName}>{truncated}</span>
									<ClipboardList size={14} className={sessionIcon} />
								</button>
							);
						})}
					</div>
				</div>
			</aside>
		</>
	);
}
