import { MoreHorizontal } from "lucide-react";
import { ICON_BTN } from "../utils/helpers.js";

export function SessionTitleBar({
	title,
	streaming,
}: {
	title: string;
	streaming: boolean;
}) {
	return (
		<div className="flex items-center justify-between px-4 py-2 gap-2 border-b border-oc-border bg-oc-card shrink-0">
			<span className="text-[13px] font-medium text-oc-fg-muted flex-1 min-w-0 truncate">{title}</span>
			<div className="flex items-center gap-1 shrink-0">
				{streaming ? (
					<span className="w-4 h-4 border-[1.5px] border-oc-border border-t-oc-fg-faint rounded-full animate-oc-spinner" />
				) : null}
				<button className={ICON_BTN} type="button">
					<MoreHorizontal size={16} />
				</button>
			</div>
		</div>
	);
}
