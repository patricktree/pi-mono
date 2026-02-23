import { css } from "@linaria/core";
import { ChevronDown } from "lucide-react";

const panelRoot = css`
	display: flex;
	flex-direction: column;
	min-height: 300px;
`;

const panelHeader = css`
	padding: 8px 16px;
`;

const headerBtn = css`
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 0;
	font-size: 0.875rem;
	font-weight: 600;
	color: var(--color-oc-fg);
	cursor: pointer;
	& svg {
		color: var(--color-oc-fg-muted);
	}
`;

const emptyContent = css`
	flex: 1 1 0%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	color: var(--color-oc-fg-muted);
	font-size: 0.875rem;
	padding: 32px;
`;

const emptyIcon = css`
	margin-bottom: 12px;
	display: flex;
	justify-content: center;
`;

export function ChangesPanel() {
	return (
		<div className={panelRoot}>
			<div className={panelHeader}>
				<button className={headerBtn} type="button">
					Session changes
					<ChevronDown size={14} />
				</button>
			</div>
			<div className={emptyContent}>
				<div className={emptyIcon}>
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
						<rect x="4" y="3" width="16" height="18" rx="2" />
						<rect x="8" y="7" width="8" height="10" rx="1" fill="currentColor" opacity="0.15" />
					</svg>
				</div>
				<p>No changes in this session yet</p>
			</div>
		</div>
	);
}
