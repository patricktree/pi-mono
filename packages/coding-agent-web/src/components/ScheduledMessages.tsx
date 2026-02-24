import { css } from "@linaria/core";
import { Clock, CornerUpLeft } from "lucide-react";
import type { UiMessage } from "../state/store.js";

const root = css`
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 8px 12px;
	border-top: 1px solid var(--color-oc-border);
	background-color: var(--color-oc-bg);
`;

const headerRow = css`
	display: flex;
	align-items: center;
	justify-content: space-between;
`;

const label = css`
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 11px;
	font-weight: 500;
	color: var(--color-oc-fg-muted);
	text-transform: uppercase;
	letter-spacing: 0.03em;
`;

const dequeueBtn = css`
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border-radius: 0.375rem;
	font-size: 11px;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
`;

const messageRow = css`
	display: flex;
`;

const bubble = css`
	padding: 8px 14px;
	background-color: var(--color-oc-user-bg);
	border: 1px solid var(--color-oc-user-border);
	border-radius: var(--radius-oc);
	font-size: 0.8125rem;
	line-height: normal;
	color: var(--color-oc-fg-muted);
	white-space: pre-wrap;
	overflow-wrap: break-word;
	opacity: 0.7;
`;

export function ScheduledMessages({
	messages,
	onDequeue,
}: {
	messages: UiMessage[];
	onDequeue: () => void;
}) {
	if (messages.length === 0) return null;

	return (
		<div className={root}>
			<div className={headerRow}>
				<div className={label}>
					<Clock size={11} />
					Scheduled
				</div>
				<button
					className={dequeueBtn}
					onClick={onDequeue}
					type="button"
				>
					<CornerUpLeft size={11} />
					Restore to editor
				</button>
			</div>
			{messages.map((message) => (
				<div className={messageRow} key={message.id}>
					<div className={bubble}>Steering: {message.text}</div>
				</div>
			))}
		</div>
	);
}
