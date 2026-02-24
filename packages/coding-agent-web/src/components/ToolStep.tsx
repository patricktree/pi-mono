import { css } from "@linaria/core";
import { CheckCircle2, ChevronRight, LoaderCircle, XCircle } from "lucide-react";
import type { BashResultData, ToolStepData, ToolStepPhase, UiMessage } from "../state/store.js";
import { Markdown } from "./Markdown.js";

const toolText = css`
	font-size: 13px;
`;

const errorText = css`
	font-size: 13px;
	color: var(--color-oc-error);
`;

const systemText = css`
	font-family: var(--font-mono);
	font-size: 0.75rem;
	line-height: 1rem;
	color: var(--color-oc-fg-muted);
	white-space: pre-wrap;
`;

const toolStepRoot = css`
	display: flex;
	flex-direction: column;
	border-radius: var(--radius-oc);
	overflow: hidden;
`;

const toolStepBtnBase = css`
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	text-align: left;
	font-size: 0.875rem;
	line-height: 1.25rem;
	padding: 8px 12px;
	border-radius: var(--radius-oc);
	cursor: pointer;
	transition: background-color 100ms;
`;

const toolStepBtnCalling = css`
	background-color: var(--color-oc-muted-bg);
	color: var(--color-oc-fg-muted);
	&:hover {
		background-color: var(--color-oc-border-light);
	}
`;

const toolStepBtnRunning = css`
	background-color: var(--color-oc-muted-bg);
	color: var(--color-oc-fg-muted);
	&:hover {
		background-color: var(--color-oc-border-light);
	}
`;

const toolStepBtnDone = css`
	background-color: #ecfdf5;
	color: #065f46;
	&:hover {
		background-color: #d1fae5;
	}
`;

const toolStepBtnError = css`
	background-color: #fef2f2;
	color: #991b1b;
	&:hover {
		background-color: #fee2e2;
	}
`;

const toolLabel = css`
	font-weight: 600;
	flex-shrink: 0;
`;

const toolDesc = css`
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
`;

const spinIcon = css`
	animation: spin 1s linear infinite;
	flex-shrink: 0;
`;

const statusIcon = css`
	flex-shrink: 0;
`;

const chevronIcon = css`
	flex-shrink: 0;
	transition: transform 150ms;
`;

const chevronExpanded = css`
	transform: rotate(90deg);
`;

const expandedContent = css`
	margin-top: 8px;
`;

const bashCommandLine = css`
	font-weight: 600;
`;

const codeBlock = css`
	display: block;
	padding: 12px 16px;
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	background-color: var(--color-oc-card);
	font-family: var(--font-mono);
	font-size: 13px;
	line-height: normal;
	overflow-x: auto;
	white-space: pre-wrap;
	word-break: break-all;
	margin: 0;
	color: var(--color-oc-fg);
`;

const bashBox = css`
	border: 1px solid var(--color-oc-border);
	border-radius: var(--radius-oc);
	background-color: var(--color-oc-card);
	padding: 12px 16px;
	font-family: var(--font-mono);
	font-size: 13px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-all;
	overflow-x: auto;
	color: var(--color-oc-fg);
`;

const bashCommand = css`
	font-weight: 600;
	margin-bottom: 4px;
`;

const bashOutput = css`
	color: var(--color-oc-fg-muted);
`;

export function renderStep(
	message: UiMessage,
	expandedTools: Set<string>,
	setExpandedTools: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
	switch (message.kind) {
		case "thinking":
			return null;
		case "tool":
			return message.toolStep ? (
				<ToolStep step={message.toolStep} messageId={message.id} expandedTools={expandedTools} setExpandedTools={setExpandedTools} />
			) : (
				<p className={toolText}>{message.text}</p>
			);
		case "bash":
			return message.bashResult ? (
				<BashResultBox result={message.bashResult} />
			) : (
				<pre className={bashBox}>{message.text}</pre>
			);
		case "error":
			return <p className={errorText}>{message.text}</p>;
		case "system":
			return <p className={systemText}>{message.text}</p>;
		case "assistant":
			return <Markdown text={message.text} />;
		default:
			return <p className={toolText}>{message.text}</p>;
	}
}

function getPhaseButtonClass(phase: ToolStepPhase): string {
	switch (phase) {
		case "done":
			return toolStepBtnDone;
		case "error":
			return toolStepBtnError;
		case "running":
			return toolStepBtnRunning;
		case "calling":
		default:
			return toolStepBtnCalling;
	}
}

function ToolStep({
	step,
	messageId,
	expandedTools,
	setExpandedTools,
}: {
	step: ToolStepData;
	messageId: string;
	expandedTools: Set<string>;
	setExpandedTools: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
	const isExpanded = expandedTools.has(messageId);
	const toolLabelText = getToolLabel(step.toolName);
	const toolDescription = getToolDescription(step);
	const phaseClass = getPhaseButtonClass(step.phase);

	return (
		<div className={toolStepRoot}>
			<button
				className={`${toolStepBtnBase} ${phaseClass}`}
				onClick={() => {
					setExpandedTools((prev) => {
						const next = new Set(prev);
						if (next.has(messageId)) {
							next.delete(messageId);
						} else {
							next.add(messageId);
						}
						return next;
					});
				}}
				type="button"
			>
				<ChevronRight size={14} className={`${chevronIcon} ${isExpanded ? chevronExpanded : ""}`} />
				{step.phase === "done" ? (
					<CheckCircle2 size={14} className={statusIcon} />
				) : step.phase === "error" ? (
					<XCircle size={14} className={statusIcon} />
				) : step.phase === "running" ? (
					<LoaderCircle size={14} className={spinIcon} />
				) : null}
				<span className={toolLabel}>{toolLabelText}</span>
				<span className={toolDesc}>{toolDescription}</span>
			</button>
			{isExpanded && (bashCommandPrefix(step) || step.result) ? (
				<div className={expandedContent}>
					<pre className={codeBlock}>
						{bashCommandPrefix(step) ? <code className={bashCommandLine}>{bashCommandPrefix(step)}</code> : null}
						{bashCommandPrefix(step) && step.result ? "\n" : null}
						{step.result ? <code>{step.result}</code> : null}
					</pre>
				</div>
			) : null}
		</div>
	);
}

function BashResultBox({ result }: { result: BashResultData }) {
	return (
		<div className={bashBox}>
			<div className={bashCommand}>$ {result.command}</div>
			{result.output ? <div className={bashOutput}>{result.output}</div> : null}
		</div>
	);
}

function getToolLabel(toolName: string): string {
	switch (toolName) {
		case "bash":
			return "Shell";
		case "read":
			return "Read";
		case "write":
			return "Write";
		case "edit":
			return "Edit";
		case "glob":
			return "Glob";
		case "grep":
			return "Grep";
		default:
			return toolName;
	}
}

function getToolDescription(step: ToolStepData): string {
	try {
		const args = JSON.parse(step.toolArgs);
		if (step.toolName === "bash" && args.command) {
			return args.command;
		}
		if (step.toolName === "read" && args.path) {
			return args.path;
		}
		if (step.toolName === "write" && args.path) {
			return args.path;
		}
		if (step.toolName === "edit" && args.path) {
			return args.path;
		}
		if (step.toolName === "glob" && args.pattern) {
			return args.pattern;
		}
		if (step.toolName === "grep" && args.pattern) {
			return args.pattern;
		}
	} catch {
		// ignore parse errors
	}
	return step.toolArgs;
}

function bashCommandPrefix(step: ToolStepData): string | undefined {
	if (step.toolName !== "bash") return undefined;
	try {
		const args = JSON.parse(step.toolArgs);
		if (args.command) return `$ ${args.command}`;
	} catch {
		// ignore
	}
	return undefined;
}


