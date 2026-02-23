import { css } from "@linaria/core";
import type { UiMessage } from "../state/store.js";

const bubbleRow = css`
	display: flex;
`;

const bubble = css`
	max-width: 85%;
	padding: 10px 16px;
	background-color: var(--color-oc-user-bg);
	border: 1px solid var(--color-oc-user-border);
	border-radius: var(--radius-oc);
	font-size: 0.875rem;
	line-height: normal;
	color: var(--color-oc-fg);
	white-space: pre-wrap;
	overflow-wrap: break-word;
`;

const imageRow = css`
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 8px;
`;

const imageThumb = css`
	width: 64px;
	height: 64px;
	overflow: hidden;
	border-radius: 0.375rem;
	border: 1px solid var(--color-oc-border);
`;

const imageImg = css`
	width: 100%;
	height: 100%;
	object-fit: cover;
`;

export function UserBubble({ message }: { message: UiMessage }) {
	return (
		<div className={bubbleRow}>
			<div className={bubble}>
				{message.text}
				{message.images && message.images.length > 0 ? (
					<div className={imageRow}>
						{message.images.map((image, index) => (
							<div className={imageThumb} key={`${message.id}-${index.toString()}`}>
								<img
									alt="attached"
									src={`data:${image.mimeType};base64,${image.data}`}
									className={imageImg}
								/>
							</div>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
