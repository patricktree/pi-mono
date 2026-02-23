import { Folder, GitBranch, Pencil } from "lucide-react";

export function EmptyState({ cwd }: { cwd?: string }) {
	return (
		<div className="flex-1 flex flex-col justify-end px-5 pt-6 pb-8">
			<h2 className="text-2xl font-light text-oc-fg-faint mb-5">New session</h2>
			<div className="flex flex-col gap-2.5">
				{cwd ? (
					<div className="flex items-center gap-3 text-sm text-oc-fg-muted [&_svg]:text-oc-fg-faint [&_svg]:shrink-0 [&_strong]:text-oc-fg [&_strong]:font-semibold">
						<Folder size={16} />
						<span className="truncate">
							{cwd.replace(/\/[^/]+$/, "/")}<strong>{cwd.split("/").pop()}</strong>
						</span>
					</div>
				) : null}
				<div className="flex items-center gap-3 text-sm text-oc-fg-muted [&_svg]:text-oc-fg-faint [&_svg]:shrink-0 [&_strong]:text-oc-fg [&_strong]:font-semibold">
					<GitBranch size={16} />
					<span>Main branch (dev)</span>
				</div>
				<div className="flex items-center gap-3 text-sm text-oc-fg-muted [&_svg]:text-oc-fg-faint [&_svg]:shrink-0 [&_strong]:text-oc-fg [&_strong]:font-semibold">
					<Pencil size={16} />
					<span>Last modified <strong>3 minutes ago</strong></span>
				</div>
			</div>
		</div>
	);
}
