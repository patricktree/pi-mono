import { css, cx } from "@linaria/core";
import { ChevronRight, Folder, FolderOpen, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DirectoryEntry } from "../protocol/types.js";
import { shortenPath } from "../utils/helpers.js";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const backdrop = css`
	position: fixed;
	inset: 0;
	z-index: 60;
	background-color: rgba(0, 0, 0, 0.3);
	backdrop-filter: blur(2px);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;
`;

const dialog = css`
	background: var(--color-oc-card);
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	width: 100%;
	max-width: 480px;
	max-height: 80vh;
	display: flex;
	flex-direction: column;
	box-shadow:
		0 20px 25px -5px rgba(0, 0, 0, 0.1),
		0 8px 10px -6px rgba(0, 0, 0, 0.1);
`;

const header = css`
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 16px 12px;
	border-bottom: 1px solid var(--color-oc-border-light);
`;

const headerTitle = css`
	font-weight: 600;
	font-size: 15px;
`;

const closeBtn = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 0.375rem;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
`;

const breadcrumbBar = css`
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 8px 16px;
	font-size: 13px;
	color: var(--color-oc-fg-muted);
	background-color: var(--color-oc-muted-bg);
	border-bottom: 1px solid var(--color-oc-border-light);
	min-height: 36px;
	flex-wrap: wrap;
`;

const breadcrumbSegment = css`
	cursor: pointer;
	padding: 2px 4px;
	border-radius: 4px;
	color: var(--color-oc-fg-muted);
	white-space: nowrap;
	&:hover {
		background-color: var(--color-oc-border-light);
		color: var(--color-oc-fg);
	}
`;

const breadcrumbSeparator = css`
	color: var(--color-oc-fg-faint);
	flex-shrink: 0;
`;

const entryList = css`
	flex: 1 1 0%;
	min-height: 0;
	overflow-y: auto;
	padding: 4px 8px;
`;

const entryItem = css`
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 6px 12px;
	border-radius: 0.375rem;
	text-align: left;
	font-size: 13px;
	color: var(--color-oc-fg);
	cursor: pointer;
	&:hover {
		background-color: var(--color-oc-muted-bg);
	}
`;

const entryName = css`
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	flex: 1 1 0%;
	min-width: 0;
`;

const emptyMsg = css`
	padding: 16px 12px;
	font-size: 13px;
	color: var(--color-oc-fg-muted);
	text-align: center;
`;

const loadingMsg = css`
	padding: 24px 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	font-size: 13px;
	color: var(--color-oc-fg-muted);
`;

const errorMsg = css`
	padding: 12px 16px;
	font-size: 13px;
	color: var(--color-oc-error);
`;

const spinAnimation = css`
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	animation: spin 1s linear infinite;
`;

const footer = css`
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
	padding: 12px 16px;
	border-top: 1px solid var(--color-oc-border-light);
`;

const footerPath = css`
	flex: 1 1 0%;
	min-width: 0;
	font-size: 12px;
	color: var(--color-oc-fg-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--font-mono);
`;

const cancelBtn = css`
	padding: 6px 14px;
	border-radius: 0.375rem;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	color: var(--color-oc-fg-muted);
	border: 1px solid var(--color-oc-border);
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
`;

const selectBtn = css`
	padding: 6px 14px;
	border-radius: 0.375rem;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	background-color: var(--color-oc-primary);
	color: var(--color-oc-primary-fg);
	&:hover {
		opacity: 0.9;
	}
	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DirectoryPickerProps {
	initialPath: string;
	onSelect: (path: string) => void;
	onCancel: () => void;
	listDirectory: (path: string) => Promise<{ absolutePath: string; entries: DirectoryEntry[] }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Parse an absolute path into breadcrumb segments.
 * For "/Users/user/workspace" returns ["/", "Users", "user", "workspace"].
 */
function pathSegments(absolutePath: string): { label: string; path: string }[] {
	const segments: { label: string; path: string }[] = [{ label: "/", path: "/" }];
	const parts = absolutePath.split("/").filter(Boolean);
	for (let i = 0; i < parts.length; i++) {
		segments.push({
			label: parts[i],
			path: `/${parts.slice(0, i + 1).join("/")}`,
		});
	}
	return segments;
}

export function DirectoryPicker({ initialPath, onSelect, onCancel, listDirectory }: DirectoryPickerProps) {
	const [currentPath, setCurrentPath] = useState(initialPath);
	const [entries, setEntries] = useState<DirectoryEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const dialogRef = useRef<HTMLDivElement>(null);

	const navigate = useCallback(
		async (path: string) => {
			setLoading(true);
			setError(null);
			try {
				const result = await listDirectory(path);
				setCurrentPath(result.absolutePath);
				setEntries(result.entries);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setLoading(false);
			}
		},
		[listDirectory],
	);

	useEffect(() => {
		void navigate(initialPath);
	}, [initialPath, navigate]);

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onCancel();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onCancel]);

	const segments = pathSegments(currentPath);

	return (
		<div
			className={backdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onCancel();
			}}
			data-testid="directory-picker"
		>
			<div className={dialog} ref={dialogRef}>
				{/* Header */}
				<div className={header}>
					<span className={headerTitle}>Choose directory</span>
					<button
						type="button"
						className={closeBtn}
						onClick={onCancel}
						aria-label="Close"
					>
						<X size={16} />
					</button>
				</div>

				{/* Breadcrumb */}
				<div className={breadcrumbBar} data-testid="directory-breadcrumb">
					{segments.map((seg, i) => (
						<span key={seg.path} style={{ display: "inline-flex", alignItems: "center" }}>
							{i > 0 && (
								<ChevronRight size={12} className={breadcrumbSeparator} />
							)}
							<button
								type="button"
								className={breadcrumbSegment}
								onClick={() => void navigate(seg.path)}
							>
								{seg.label}
							</button>
						</span>
					))}
				</div>

				{/* Entry list */}
				<div className={entryList} data-testid="directory-entries">
					{loading ? (
						<div className={loadingMsg}>
							<Loader2 size={16} className={spinAnimation} />
							Loading...
						</div>
					) : error ? (
						<div className={errorMsg}>{error}</div>
					) : entries.length === 0 ? (
						<div className={emptyMsg}>No subdirectories</div>
					) : (
						entries.map((entry) => (
							<button
								key={entry.name}
								type="button"
								className={entryItem}
								onClick={() => void navigate(`${currentPath === "/" ? "" : currentPath}/${entry.name}`)}
								data-testid={`dir-entry-${entry.name}`}
							>
								<Folder size={16} style={{ color: "var(--color-oc-fg-faint)", flexShrink: 0 }} />
								<span className={entryName}>{entry.name}</span>
								<ChevronRight size={14} style={{ color: "var(--color-oc-fg-faint)", flexShrink: 0 }} />
							</button>
						))
					)}
				</div>

				{/* Footer */}
				<div className={footer}>
					<span className={footerPath}>{shortenPath(currentPath)}</span>
					<button type="button" className={cancelBtn} onClick={onCancel}>
						Cancel
					</button>
					<button
						type="button"
						className={selectBtn}
						disabled={loading}
						onClick={() => onSelect(currentPath)}
						data-testid="directory-select-btn"
					>
						Select
					</button>
				</div>
			</div>
		</div>
	);
}
