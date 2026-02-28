import { css } from "@linaria/core";
import type { UiMessage } from "../state/store.js";
import type { Turn } from "../utils/helpers.js";
import { A2uiSurface } from "./a2ui/A2uiSurface.js";
import type { A2uiAction } from "./a2ui/types.js";
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
	onA2uiAction,
}: {
	orphans: UiMessage[];
	turns: Turn[];
	latestUserId: string | undefined;
	streaming: boolean;
	expandedTools: Set<string>;
	setExpandedTools: React.Dispatch<React.SetStateAction<Set<string>>>;
	cwd: string | undefined;
	onA2uiAction: (surfaceId: string, action: A2uiAction) => void;
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
							{message.kind === "a2ui" && message.a2uiSurface ? (
								<A2uiSurface data={message.a2uiSurface} onAction={onA2uiAction} />
							) : (
								renderStep(message, expandedTools, setExpandedTools)
							)}
						</div>
					))}

					{turns.map((turn) => {
						const isLatestTurn = turn.user.id === latestUserId;
						const hasOutput = turn.steps.some((s) => s.kind === "assistant" || s.kind === "error" || s.kind === "tool");
						const visibleSteps = turn.steps.filter((s) => s.kind !== "thinking");
						const lastVisibleStep = visibleSteps.at(-1);
						const showTrailingDot = streaming && isLatestTurn && lastVisibleStep !== undefined && lastVisibleStep.kind !== "assistant";

						return (
							<div className={turnWrap} key={turn.user.id}>
								<UserBubble message={turn.user} />

								{/* Streaming dot before any output appears */}
								{streaming && isLatestTurn && !hasOutput ? (
									<span className={cursorDot} />
								) : null}

								{/* Steps rendered in original order to preserve interleaving */}
								{turn.steps.map((message) => {
									if (message.kind === "assistant") {
										const isLastVisible = message.id === lastVisibleStep?.id;
										return (
											<div className={assistantText} key={message.id}>
												<Markdown text={message.text} />
												{streaming && isLatestTurn && isLastVisible ? (
													<span className={cursorDot} />
												) : null}
											</div>
										);
									}
									if (message.kind === "thinking") {
										return null;
									}
									if (message.kind === "a2ui" && message.a2uiSurface) {
										return (
											<div key={message.id}>
												<A2uiSurface data={message.a2uiSurface} onAction={onA2uiAction} />
											</div>
										);
									}
									return (
										<div key={message.id}>
											{renderStep(message, expandedTools, setExpandedTools)}
										</div>
									);
								})}

								{/* Streaming dot after non-text steps (e.g. tool calls) */}
								{showTrailingDot ? <span className={cursorDot} /> : null}
							</div>
						);
					})}
				</>
			)}
		</div>
	);
}
