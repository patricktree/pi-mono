import { css, cx } from "@linaria/core";
import { MessageSquare, Terminal } from "lucide-react";

export type InputMode = "prompt" | "shell";

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

const toggleGroup = css`
	display: flex;
	align-items: center;
	gap: 2px;
`;

const toggleBtn = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 0.375rem;
	cursor: pointer;
	flex-shrink: 0;
	color: var(--color-oc-fg-faint);
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
`;

const toggleBtnActive = css`
	color: var(--color-oc-fg);
`;

export function BottomToolbar({
	mode,
	onModeChange,
}: {
	mode: InputMode;
	onModeChange: (mode: InputMode) => void;
}) {
	return (
		<div className={toolbarRow}>
			<div className={spacer} />

			<div className={toggleGroup}>
				<button
					className={cx(toggleBtn, mode === "shell" && toggleBtnActive)}
					onClick={() => onModeChange("shell")}
					type="button"
					aria-label="Shell mode"
				>
					<Terminal size={16} />
				</button>
				<button
					className={cx(toggleBtn, mode === "prompt" && toggleBtnActive)}
					onClick={() => onModeChange("prompt")}
					type="button"
					aria-label="Prompt mode"
				>
					<MessageSquare size={16} />
				</button>
			</div>
		</div>
	);
}
