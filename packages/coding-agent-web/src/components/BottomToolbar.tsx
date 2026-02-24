import { css, cx } from "@linaria/core";
import { ChevronDown, MessageSquare, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThinkingLevel } from "../protocol/types.js";

export type InputMode = "prompt" | "shell";

const THINKING_LEVELS: { value: ThinkingLevel; description: string }[] = [
	{ value: "off", description: "No reasoning" },
	{ value: "minimal", description: "Very brief reasoning (~1k tokens)" },
	{ value: "low", description: "Light reasoning (~2k tokens)" },
	{ value: "medium", description: "Moderate reasoning (~8k tokens)" },
	{ value: "high", description: "Deep reasoning (~16k tokens)" },
	{ value: "xhigh", description: "Maximum reasoning (~32k tokens)" },
];

const toolbarRow = css`
	display: flex;
	align-items: center;
	gap: 0;
	padding: 6px 8px;
	margin-top: 6px;
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	background-color: var(--color-oc-card);
`;

const spacer = css`
	flex: 1 1 0%;
`;

const toggleGroup = css`
	display: flex;
	align-items: center;
	gap: 2px;
	border: 1px solid var(--color-oc-border);
	border-radius: 0.5rem;
	background-color: var(--color-oc-muted-bg);
`;

const toggleBtn = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 0.375rem;
	cursor: pointer;
	flex-shrink: 0;
	color: var(--color-oc-fg-faint);
	transition: background-color 0.15s, color 0.15s;
	&:hover {
		color: var(--color-oc-fg);
	}
`;

const toggleBtnActive = css`
	background-color: var(--color-oc-card);
	color: var(--color-oc-fg);
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
`;

/* -- Thinking selector styles -- */

const thinkingSelectorWrapper = css`
	position: relative;
`;

const thinkingBtn = css`
	display: inline-flex;
	align-items: center;
	gap: 4px;
	height: 28px;
	padding: 0 8px;
	border-radius: 0.375rem;
	cursor: pointer;
	font-size: 13px;
	color: var(--color-oc-fg-muted);
	white-space: nowrap;
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
`;

const dropdownMenu = css`
	position: absolute;
	bottom: calc(100% + 4px);
	left: 0;
	min-width: 120px;
	background-color: var(--color-oc-card);
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	padding: 4px 0;
	z-index: 50;
`;

const dropdownItem = css`
	display: flex;
	align-items: center;
	width: 100%;
	padding: 6px 12px;
	font-size: 13px;
	color: var(--color-oc-fg);
	cursor: pointer;
	white-space: nowrap;
	text-align: left;
	gap: 6px;
	&:hover {
		background-color: var(--color-oc-muted-bg);
	}
`;

const checkMark = css`
	width: 14px;
	flex-shrink: 0;
	font-size: 14px;
	color: var(--color-oc-fg);
`;

const itemLabel = css`
	min-width: 56px;
`;

const descriptionText = css`
	margin-left: auto;
	font-size: 12px;
	color: var(--color-oc-fg-faint);
`;

export function BottomToolbar({
	mode,
	onModeChange,
	thinkingLevel,
	onThinkingLevelChange,
}: {
	mode: InputMode;
	onModeChange: (mode: InputMode) => void;
	thinkingLevel: ThinkingLevel | undefined;
	onThinkingLevelChange: (level: ThinkingLevel) => void;
}) {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement | null>(null);

	const handleSelect = useCallback(
		(level: ThinkingLevel) => {
			onThinkingLevelChange(level);
			setDropdownOpen(false);
		},
		[onThinkingLevelChange],
	);

	// Close dropdown on outside click
	useEffect(() => {
		if (!dropdownOpen) return;
		function onPointerDown(event: PointerEvent) {
			if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
				setDropdownOpen(false);
			}
		}
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [dropdownOpen]);

	const currentLevel = thinkingLevel ?? "medium";

	return (
		<div className={toolbarRow}>
			{/* Thinking level selector */}
			<div className={thinkingSelectorWrapper} ref={wrapperRef}>
				<button
					className={thinkingBtn}
					onClick={() => setDropdownOpen((open) => !open)}
					type="button"
					aria-label="Select thinking level"
				>
					{currentLevel}
					<ChevronDown size={14} />
				</button>

				{dropdownOpen ? (
					<div className={dropdownMenu}>
						{THINKING_LEVELS.map((option) => (
							<button
								className={dropdownItem}
								key={option.value}
								onClick={() => handleSelect(option.value)}
								type="button"
							>
								<span className={checkMark}>{currentLevel === option.value ? "✓" : ""}</span>
								<span className={itemLabel}>{option.value}</span>
								<span className={descriptionText}>{option.description}</span>
							</button>
						))}
					</div>
				) : null}
			</div>

			<div className={spacer} />

			<div className={toggleGroup}>
				<button
					className={cx(toggleBtn, mode === "shell" && toggleBtnActive)}
					onClick={() => onModeChange("shell")}
					type="button"
					aria-label="Shell mode"
				>
					<Terminal size={16} />
				</button>
				<button
					className={cx(toggleBtn, mode === "prompt" && toggleBtnActive)}
					onClick={() => onModeChange("prompt")}
					type="button"
					aria-label="Prompt mode"
				>
					<MessageSquare size={16} />
				</button>
			</div>
		</div>
	);
}
