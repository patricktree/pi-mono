import { css } from "@linaria/core";
import type { UiMessage } from "../state/store.js";
import type { Turn } from "../utils/helpers.js";
import { EmptyState } from "./EmptyState.js";
import { Markdown } from "./Markdown.js";
import { renderStep } from "./ToolStep.js";
import { UserBubble } from "./UserBubble.js";

const listRoot = css`
	display: flex;
	flex-direction: column;
	min-height: 100%;
`;

const orphanWrap = css`
	padding: 0 16px;
`;

const turnWrap = css`
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: 0 16px 20px;
`;

const thinkingText = css`
	font-size: 0.875rem;
	line-height: 1.25rem;
	color: var(--color-oc-fg-muted);
`;

const assistantText = css`
	font-size: 0.875rem;
	line-height: 1.25rem;
	color: var(--color-oc-fg);
`;

const cursorDot = css`
	display: inline-block;
	width: 6px;
	height: 6px;
	border-radius: 9999px;
	background-color: var(--color-oc-primary);
	vertical-align: middle;
	margin-left: 4px;
	animation: oc-pulse 1s infinite;
`;

export function MessageList({
	orphans,
	turns,
	latestUserId,
	streaming,
	expandedTools,
	setExpandedTools,
	cwd,
}: {
	orphans: UiMessage[];
	turns: Turn[];
	latestUserId: string | undefined;
	streaming: boolean;
	expandedTools: Set<string>;
	setExpandedTools: React.Dispatch<React.SetStateAction<Set<string>>>;
	cwd: string | undefined;
}) {
	const hasContent = orphans.length > 0 || turns.length > 0;

	return (
		<div className={listRoot}>
			{!hasContent ? (
				<EmptyState cwd={cwd} />
			) : (
				<>
					{orphans.map((message) => (
						<div className={orphanWrap} key={message.id}>
							{renderStep(message, expandedTools, setExpandedTools)}
						</div>
					))}

					{turns.map((turn) => {
						const isLatestTurn = turn.user.id === latestUserId;
						const hasOutput = turn.steps.some((s) => s.kind === "assistant" || s.kind === "error" || s.kind === "tool");

						return (
							<div className={turnWrap} key={turn.user.id}>
								<UserBubble message={turn.user} />

								{/* Thinking indicator - only show during streaming when no other output yet */}
								{streaming && isLatestTurn && !hasOutput ? (
									<p className={thinkingText}>Thinking</p>
								) : null}

								{/* Steps rendered in original order to preserve interleaving */}
								{turn.steps.map((message) => {
									if (message.kind === "assistant") {
										return (
											<div className={assistantText} key={message.id}>
												<Markdown text={message.text} />
												{streaming && isLatestTurn && message.id === turn.steps.filter((s) => s.kind === "assistant").at(-1)?.id ? (
													<span className={cursorDot} />
												) : null}
											</div>
										);
									}
									if (message.kind === "thinking") {
										return null;
									}
									return (
										<div key={message.id}>
											{renderStep(message, expandedTools, setExpandedTools)}
										</div>
									);
								})}
							</div>
						);
					})}
				</>
			)}
		</div>
	);
}
