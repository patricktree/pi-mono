import { css } from "@linaria/core";
import { Folder, GitBranch, Pencil } from "lucide-react";

const emptyRoot = css`
	flex: 1 1 0%;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	padding: 24px 20px 32px;
`;

const heading = css`
	font-size: 1.5rem;
	line-height: 2rem;
	font-weight: 300;
	color: var(--color-oc-fg-faint);
	margin-bottom: 20px;
`;

const infoList = css`
	display: flex;
	flex-direction: column;
	gap: 10px;
`;

const infoRow = css`
	display: flex;
	align-items: center;
	gap: 12px;
	font-size: 0.875rem;
	line-height: 1.25rem;
	color: var(--color-oc-fg-muted);
	& svg {
		color: var(--color-oc-fg-faint);
		flex-shrink: 0;
	}
	& strong {
		color: var(--color-oc-fg);
		font-weight: 600;
	}
`;

const truncated = css`
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
`;

export function EmptyState({ cwd }: { cwd?: string }) {
	return (
		<div className={emptyRoot}>
			<h2 className={heading}>New session</h2>
			<div className={infoList}>
				{cwd ? (
					<div className={infoRow}>
						<Folder size={16} />
						<span className={truncated}>
							{cwd.replace(/\/[^/]+$/, "/")}<strong>{cwd.split("/").pop()}</strong>
						</span>
					</div>
				) : null}
				<div className={infoRow}>
					<GitBranch size={16} />
					<span>Main branch (dev)</span>
				</div>
				<div className={infoRow}>
					<Pencil size={16} />
					<span>Last modified <strong>3 minutes ago</strong></span>
				</div>
			</div>
		</div>
	);
}
