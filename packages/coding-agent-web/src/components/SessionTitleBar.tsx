import { css } from "@linaria/core";

const titleBarStyle = css`
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 16px;
	gap: 8px;
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

const rightGroup = css`
	display: flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
`;

const spinnerIcon = css`
	width: 16px;
	height: 16px;
	border: 1.5px solid var(--color-oc-border);
	border-top-color: var(--color-oc-fg-faint);
	border-radius: 9999px;
	animation: oc-spinner 0.8s linear infinite;
`;

export function SessionTitleBar({
	title,
	streaming,
}: {
	title: string;
	streaming: boolean;
}) {
	return (
		<div className={titleBarStyle}>
			<span className={titleText}>{title}</span>
			{streaming ? (
				<div className={rightGroup}>
					<span className={spinnerIcon} />
				</div>
			) : null}
		</div>
	);
}
