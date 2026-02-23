import { ChevronDown, Monitor, Terminal } from "lucide-react";
import { cn } from "../lib/utils.js";
import { ICON_BTN, TOOLBAR_ITEM } from "../utils/helpers.js";

export function BottomToolbar() {
	return (
		<div className="flex items-center gap-0 py-1.5 px-2 mt-1.5 border border-oc-border rounded-oc bg-oc-card">
			<button className={TOOLBAR_ITEM} type="button">
				Build
				<ChevronDown size={12} />
			</button>
			<button className={TOOLBAR_ITEM} type="button">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<path d="M12 2L2 7l10 5 10-5-10-5z" />
					<path d="M2 17l10 5 10-5" />
					<path d="M2 12l10 5 10-5" />
				</svg>
				Big Pickle
				<ChevronDown size={12} />
			</button>
			<button className={TOOLBAR_ITEM} type="button">
				Default
				<ChevronDown size={12} />
			</button>
			<div className="flex-1" />
			<button className={cn(ICON_BTN, "w-7 h-7")} type="button">
				<Terminal size={16} />
			</button>
			<button className={cn(ICON_BTN, "w-7 h-7")} type="button">
				<Monitor size={16} />
			</button>
		</div>
	);
}
