import { css } from "@linaria/core";
import { ChevronDown, LoaderCircle } from "lucide-react";
import type { ToolStepData, UiMessage } from "../state/store.js";
import { Markdown } from "./Markdown.js";

const toolText = css`
	font-size: 13px;
`;

const errorText = css`
	font-size: 13px;
	color: var(--color-oc-error);
`;

const systemText = css`
	font-size: 0.75rem;
	line-height: 1rem;
	color: var(--color-oc-fg-muted);
`;

const toolStepRoot = css`
	display: flex;
	flex-direction: column;
`;

const toolStepBtn = css`
	display: flex;
	align-items: center;
	gap: 8px;
	text-align: left;
	font-size: 0.875rem;
	line-height: 1.25rem;
	color: var(--color-oc-fg-muted);
	cursor: pointer;
	&:hover {
		color: var(--color-oc-fg);
	}
`;

const toolLabel = css`
	font-weight: 600;
	color: var(--color-oc-fg);
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

const chevronIcon = css`
	color: var(--color-oc-fg-faint);
	flex-shrink: 0;
	transition: transform 150ms;
`;

const expandedContent = css`
	margin-top: 8px;
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

	return (
		<div className={toolStepRoot}>
			<button
				className={toolStepBtn}
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
				<span className={toolLabel}>{toolLabelText}</span>
				<span className={toolDesc}>{toolDescription}</span>
				{step.phase === "running" ? (
					<LoaderCircle size={14} className={spinIcon} />
				) : null}
				{isExpanded ? (
					<ChevronDown size={14} className={chevronIcon} />
				) : null}
			</button>
			{isExpanded ? (
				<div className={expandedContent}>
					<pre className={codeBlock}>
						<code>{formatToolCall(step)}</code>
						{step.result ? (
							<>
								{"\n\n"}
								<code>{step.result}</code>
							</>
						) : null}
					</pre>
				</div>
			) : null}
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
			return args.command.length > 40 ? `${args.command.slice(0, 40)}...` : args.command;
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
	return step.toolArgs.length > 40 ? `${step.toolArgs.slice(0, 40)}...` : step.toolArgs;
}

function formatToolCall(step: ToolStepData): string {
	if (step.toolName === "bash") {
		try {
			const args = JSON.parse(step.toolArgs);
			if (args.command) return `$ ${args.command}`;
		} catch {
			// ignore
		}
	}
	return `${step.toolName}(${step.toolArgs})`;
}
