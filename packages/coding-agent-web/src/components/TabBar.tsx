import { cn } from "../lib/utils.js";

export type TabId = "session" | "changes";

export function TabBar({
	activeTab,
	onTabChange,
}: {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
}) {
	return (
		<div className="flex border-b border-oc-border bg-oc-card shrink-0">
			<button
				className={cn(
					"flex-1 py-2.5 text-sm font-medium text-oc-fg-muted cursor-pointer text-center border-b-2 border-b-transparent -mb-px hover:text-oc-fg",
					activeTab === "session" && "text-oc-fg border-b-oc-fg",
				)}
				onClick={() => onTabChange("session")}
				type="button"
			>
				Session
			</button>
			<button
				className={cn(
					"flex-1 py-2.5 text-sm font-medium text-oc-fg-muted cursor-pointer text-center border-b-2 border-b-transparent -mb-px hover:text-oc-fg",
					activeTab === "changes" && "text-oc-fg border-b-oc-fg",
				)}
				onClick={() => onTabChange("changes")}
				type="button"
			>
				Changes
			</button>
		</div>
	);
}
