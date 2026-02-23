import type { UiMessage } from "../state/store.js";
import type { Turn } from "../utils/helpers.js";
import { EmptyState } from "./EmptyState.js";
import { Markdown } from "./Markdown.js";
import { renderStep } from "./ToolStep.js";
import { UserBubble } from "./UserBubble.js";

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
		<div className="flex flex-col min-h-full">
			{!hasContent ? (
				<EmptyState cwd={cwd} />
			) : (
				<>
					{orphans.map((message) => (
						<div className="px-4" key={message.id}>
							{renderStep(message, expandedTools, setExpandedTools)}
						</div>
					))}

					{turns.map((turn) => {
						const isLatestTurn = turn.user.id === latestUserId;
						const hasOutput = turn.steps.some((s) => s.kind === "assistant" || s.kind === "error" || s.kind === "tool");

						return (
							<div className="flex flex-col gap-4 px-4 pb-5" key={turn.user.id}>
								<UserBubble message={turn.user} />

								{/* Thinking indicator - only show during streaming when no other output yet */}
								{streaming && isLatestTurn && !hasOutput ? (
									<p className="text-sm text-oc-fg-muted">Thinking</p>
								) : null}

								{/* Steps rendered in original order to preserve interleaving */}
								{turn.steps.map((message) => {
									if (message.kind === "assistant") {
										return (
											<div className="text-sm text-oc-fg" key={message.id}>
												<Markdown text={message.text} />
												{streaming && isLatestTurn && message.id === turn.steps.filter((s) => s.kind === "assistant").at(-1)?.id ? (
													<span className="inline-block w-1.5 h-1.5 rounded-full bg-oc-primary align-middle ml-1 animate-oc-pulse" />
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
