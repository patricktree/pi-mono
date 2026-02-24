import { css } from "@linaria/core";

const titleBarStyle = css`
	display: flex;
	align-items: center;
	padding: 8px 16px;
	border-bottom: 1px solid var(--color-oc-border);
	background-color: var(--color-oc-card);
	flex-shrink: 0;
`;

const titleText = css`
	font-size: 13px;
	font-weight: 500;
	color: var(--color-oc-fg-muted);
	flex: 1 1 0%;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
`;

export function SessionTitleBar({ title }: { title: string }) {
	return (
		<div className={titleBarStyle}>
			<span className={titleText}>{title}</span>
		</div>
	);
}
