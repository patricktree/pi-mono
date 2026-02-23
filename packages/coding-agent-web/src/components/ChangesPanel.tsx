import { ChevronDown } from "lucide-react";

export function ChangesPanel() {
	return (
		<div className="flex flex-col min-h-[300px]">
			<div className="px-4 py-2">
				<button className="inline-flex items-center gap-1 py-1 text-sm font-semibold text-oc-fg cursor-pointer [&_svg]:text-oc-fg-muted" type="button">
					Session changes
					<ChevronDown size={14} />
				</button>
			</div>
			<div className="flex-1 flex flex-col items-center justify-center text-center text-oc-fg-muted text-sm p-8">
				<div className="mb-3 flex justify-center">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
						<rect x="4" y="3" width="16" height="18" rx="2" />
						<rect x="8" y="7" width="8" height="10" rx="1" fill="currentColor" opacity="0.15" />
					</svg>
				</div>
				<p>No changes in this session yet</p>
			</div>
		</div>
	);
}
