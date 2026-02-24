import { css } from "@linaria/core";
import { Monitor, Terminal } from "lucide-react";

const toolbarRow = css`
	display: flex;
	align-items: center;
	gap: 0;
	padding: 6px 8px;
	margin-top: 6px;
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	background-color: var(--color-oc-card);
`;

const spacer = css`
	flex: 1 1 0%;
`;

const smallIconBtn = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 0.375rem;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	flex-shrink: 0;
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
`;

export function BottomToolbar() {
	return (
		<div className={toolbarRow}>
			<div className={spacer} />
			<button className={smallIconBtn} type="button">
				<Terminal size={16} />
			</button>
			<button className={smallIconBtn} type="button">
				<Monitor size={16} />
			</button>
		</div>
	);
}
