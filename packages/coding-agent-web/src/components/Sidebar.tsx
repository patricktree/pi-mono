import { ClipboardList, HelpCircle, MoreHorizontal, Plus, Settings } from "lucide-react";
import { cn } from "../lib/utils.js";
import type { SessionSummary } from "../protocol/types.js";
import { ICON_BTN, SIDEBAR_ICON_BTN, shortenPath } from "../utils/helpers.js";

export function Sidebar({
	open,
	sessions,
	currentSessionId,
	currentCwd,
	onClose,
	onNewSession,
	onSwitchSession,
}: {
	open: boolean;
	sessions: SessionSummary[];
	currentSessionId: string | null;
	currentCwd: string | undefined;
	onClose: () => void;
	onNewSession: () => void;
	onSwitchSession: (session: SessionSummary) => void;
}) {
	return (
		<>
			{/* Sidebar overlay */}
			<div
				className={cn(
					"fixed inset-0 z-40 pointer-events-none transition-colors duration-200",
					open && "bg-black/20 backdrop-blur-[1px] pointer-events-auto",
				)}
				onClick={onClose}
			/>

			{/* Sidebar */}
			<aside
				className={cn(
					"fixed inset-y-0 left-0 z-50 w-[356px] max-w-[90vw] bg-oc-card border-r border-oc-border flex flex-row -translate-x-full transition-transform duration-[250ms] ease-in-out",
					open && "translate-x-0",
				)}
			>
				{/* Left icon strip */}
				<div className="w-14 shrink-0 flex flex-col items-center py-4 gap-1 border-r border-oc-border-light">
					<div className="flex flex-col items-center gap-1">
						<div className="w-9 h-9 flex items-center justify-center border-2 border-oc-fg rounded-lg mb-1">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="3" y="3" width="18" height="18" rx="4" />
								<rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" />
							</svg>
						</div>
						<button className={SIDEBAR_ICON_BTN} onClick={onNewSession} type="button" aria-label="New session">
							<Plus size={18} />
						</button>
					</div>
					<div className="mt-auto flex flex-col items-center gap-1">
						<button className={SIDEBAR_ICON_BTN} type="button" aria-label="Settings">
							<Settings size={18} />
						</button>
						<button className={SIDEBAR_ICON_BTN} type="button" aria-label="Help">
							<HelpCircle size={18} />
						</button>
					</div>
				</div>

				{/* Right content panel */}
				<div className="flex-1 min-w-0 flex flex-col overflow-hidden">
					<div className="flex items-start justify-between px-4 pt-4 pb-3">
						<div className="flex flex-col gap-0.5 min-w-0">
							<span className="font-semibold text-[15px]">pi</span>
							<span className="text-xs text-oc-fg-muted truncate">{currentCwd ? shortenPath(currentCwd) : "~/workspace"}</span>
						</div>
						<button className={ICON_BTN} type="button">
							<MoreHorizontal size={16} />
						</button>
					</div>

					<button
						className="flex items-center gap-2 mx-3 mb-2 px-3 py-2 border border-oc-border rounded-oc bg-oc-card text-sm font-medium cursor-pointer justify-center hover:bg-oc-muted-bg"
						onClick={onNewSession}
						type="button"
					>
						<Plus size={16} />
						New session
					</button>

					<div className="flex-1 min-h-0 overflow-y-auto px-2">
						{sessions.length === 0 ? (
							<p className="px-3 py-2 text-[13px] text-oc-fg-muted">No sessions yet</p>
						) : null}
						{sessions.map((session) => {
							const displayName = session.name ?? session.firstMessage;
							const truncated = displayName.length > 20 ? `${displayName.slice(0, 20)}...` : displayName;
							const active = session.id === currentSessionId;
							return (
								<button
									className={cn(
										"flex items-center gap-2 w-full py-1.5 px-3 rounded-md text-left text-[13px] text-oc-fg cursor-pointer hover:bg-oc-muted-bg",
										active && "bg-oc-muted-bg",
									)}
									onClick={() => onSwitchSession(session)}
									type="button"
									key={session.id}
								>
									<span className="text-oc-fg-faint shrink-0">—</span>
									<span className="truncate flex-1 min-w-0">{truncated}</span>
									<ClipboardList size={14} className="shrink-0 text-oc-fg-faint" />
								</button>
							);
						})}
					</div>
				</div>
			</aside>
		</>
	);
}
