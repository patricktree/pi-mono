import { ChevronDown, LoaderCircle } from "lucide-react";
import type { ToolStepData, UiMessage } from "../state/store.js";
import { Markdown } from "./Markdown.js";

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
				<p className="text-[13px]">{message.text}</p>
			);
		case "error":
			return <p className="text-[13px] text-oc-error">{message.text}</p>;
		case "system":
			return <p className="text-xs text-oc-fg-muted">{message.text}</p>;
		case "assistant":
			return <Markdown text={message.text} />;
		default:
			return <p className="text-[13px]">{message.text}</p>;
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
	const toolLabel = getToolLabel(step.toolName);
	const toolDescription = getToolDescription(step);

	return (
		<div className="flex flex-col">
			<button
				className="flex items-center gap-2 text-left text-sm text-oc-fg-muted cursor-pointer hover:text-oc-fg"
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
				<span className="font-semibold text-oc-fg shrink-0">{toolLabel}</span>
				<span className="truncate min-w-0">{toolDescription}</span>
				{step.phase === "running" ? (
					<LoaderCircle size={14} className="animate-spin shrink-0" />
				) : null}
				{isExpanded ? (
					<ChevronDown size={14} className="text-oc-fg-faint shrink-0 transition-transform duration-150" />
				) : null}
			</button>
			{isExpanded ? (
				<div className="mt-2">
					<pre className="block px-4 py-3 border border-oc-border rounded-oc bg-oc-card font-mono text-[13px] leading-normal overflow-x-auto whitespace-pre-wrap break-all m-0 text-oc-fg">
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
