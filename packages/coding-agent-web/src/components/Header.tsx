import { Menu } from "lucide-react";
import { cn } from "../lib/utils.js";
import { SIDEBAR_ICON_BTN } from "../utils/helpers.js";

export function Header({
	connected,
	hasContent,
	onOpenSidebar,
}: {
	connected: boolean;
	hasContent: boolean;
	onOpenSidebar: () => void;
}) {
	return (
		<header className="flex items-center justify-between h-12 px-3 border-b border-oc-border bg-oc-card shrink-0">
			<button
				className={SIDEBAR_ICON_BTN}
				onClick={onOpenSidebar}
				type="button"
				aria-label="Open sidebar"
			>
				<Menu size={18} />
			</button>
			<div className="flex items-center gap-2">
				<button className="inline-flex items-center gap-2 px-3.5 py-1.5 border border-oc-border rounded-full bg-oc-card text-[13px] font-medium text-oc-fg cursor-pointer hover:bg-oc-muted-bg" type="button">
					<span className={cn("w-2 h-2 rounded-full", connected ? "bg-oc-accent" : "bg-oc-error")} />
					Status
				</button>
				{hasContent ? (
					<button className="inline-flex items-center px-3.5 py-1.5 border border-oc-border rounded-lg bg-oc-card text-[13px] font-medium text-oc-fg cursor-pointer hover:bg-oc-muted-bg" type="button">
						Share
					</button>
				) : null}
			</div>
		</header>
	);
}
