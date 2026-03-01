import { css, cx } from "@linaria/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContextUsage } from "../protocol/types.js";

const titleBarStyle = css`
	display: flex;
	align-items: center;
	padding: 8px 16px;
	border-bottom: 1px solid var(--color-oc-border);
	background-color: var(--color-oc-card);
	flex-shrink: 0;
	gap: 8px;
`;

const titleText = css`
	font-size: 13px;
	font-weight: 500;
	color: var(--color-oc-fg-muted);
	flex: 1 1 0%;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
`;

const usageButtonStyle = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 9999px;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	flex-shrink: 0;
	position: relative;
	&:hover {
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	}
`;

const tooltipContainer = css`
	position: absolute;
	top: calc(100% + 8px);
	right: 0;
	z-index: 50;
`;

const tooltipStyle = css`
	background-color: var(--color-oc-fg);
	color: var(--color-oc-card);
	border-radius: 8px;
	padding: 10px 14px;
	font-size: 12px;
	white-space: nowrap;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	display: flex;
	flex-direction: column;
	gap: 4px;
`;

const tooltipRow = css`
	display: flex;
	align-items: center;
	gap: 6px;
	line-height: 1.4;
`;

const tooltipValue = css`
	font-weight: 600;
`;

const tooltipLabel = css`
	font-weight: 400;
	opacity: 0.7;
`;

const spinnerAnimation = css`
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	animation: spin 1.5s linear infinite;
`;

function formatTokenCount(tokens: number): string {
	return tokens.toLocaleString("en-US");
}

function formatPercent(percent: number): string {
	return `${Math.round(percent)}%`;
}

// SVG circular progress ring constants
const RING_SIZE = 16;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Circular progress indicator rendered as an SVG ring.
 * The filled arc represents the percentage of context window used.
 * During streaming, it spins continuously instead.
 */
function ContextRing({ percent, streaming }: { percent: number; streaming: boolean }) {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = (clamped / 100) * RING_CIRCUMFERENCE;
	const gap = RING_CIRCUMFERENCE - filled;

	if (streaming) {
		return (
			<svg
				width={RING_SIZE}
				height={RING_SIZE}
				viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
				className={cx(spinnerAnimation)}
				aria-hidden="true"
			>
				{/* background track */}
				<circle
					cx={RING_SIZE / 2}
					cy={RING_SIZE / 2}
					r={RING_RADIUS}
					fill="none"
					stroke="currentColor"
					strokeWidth={RING_STROKE}
					opacity={0.2}
				/>
				{/* spinning arc (fixed 25% fill) */}
				<circle
					cx={RING_SIZE / 2}
					cy={RING_SIZE / 2}
					r={RING_RADIUS}
					fill="none"
					stroke="currentColor"
					strokeWidth={RING_STROKE}
					strokeDasharray={`${RING_CIRCUMFERENCE * 0.25} ${RING_CIRCUMFERENCE * 0.75}`}
					strokeLinecap="round"
					transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
				/>
			</svg>
		);
	}

	return (
		<svg
			width={RING_SIZE}
			height={RING_SIZE}
			viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
			aria-hidden="true"
		>
			{/* background track */}
			<circle
				cx={RING_SIZE / 2}
				cy={RING_SIZE / 2}
				r={RING_RADIUS}
				fill="none"
				stroke="currentColor"
				strokeWidth={RING_STROKE}
				opacity={0.2}
			/>
			{/* filled arc starting from 12 o'clock */}
			<circle
				cx={RING_SIZE / 2}
				cy={RING_SIZE / 2}
				r={RING_RADIUS}
				fill="none"
				stroke="var(--color-oc-fg)"
				strokeWidth={RING_STROKE}
				strokeDasharray={`${filled} ${gap}`}
				strokeLinecap="round"
				transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
			/>
		</svg>
	);
}

export function SessionTitleBar({
	title,
	contextUsage,
	streaming,
}: {
	title: string;
	contextUsage: ContextUsage | undefined;
	streaming: boolean;
}) {
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);

	const toggleTooltip = useCallback(() => {
		if (!contextUsage) {
			return;
		}
		setTooltipOpen((prev) => !prev);
	}, [contextUsage]);

	// Close tooltip when clicking outside
	useEffect(() => {
		if (!tooltipOpen) {
			return;
		}

		function handleClickOutside(event: MouseEvent) {
			if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
				setTooltipOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [tooltipOpen]);

	const showIndicator = contextUsage || streaming;

	return (
		<div className={titleBarStyle}>
			<span className={titleText}>{title}</span>
			{showIndicator && (
				<button
					ref={buttonRef}
					type="button"
					className={usageButtonStyle}
					onClick={toggleTooltip}
					aria-label="Context usage"
				>
					<ContextRing
						percent={contextUsage?.percent ?? 0}
						streaming={streaming}
					/>
					{tooltipOpen && contextUsage && (
						<div className={tooltipContainer}>
							<div className={tooltipStyle}>
								<div className={tooltipRow}>
									<span className={tooltipValue}>{formatTokenCount(contextUsage.tokens)}</span>
									<span className={tooltipLabel}>Tokens</span>
								</div>
								<div className={tooltipRow}>
									<span className={tooltipValue}>{formatPercent(contextUsage.percent)}</span>
									<span className={tooltipLabel}>Usage</span>
								</div>
							</div>
						</div>
					)}
				</button>
			)}
		</div>
	);
}
