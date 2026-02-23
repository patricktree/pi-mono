import type { ServerEvent } from "../protocol/types.js";

export interface ScenarioStep {
	/** Milliseconds to wait before emitting this event. */
	delay: number;
	event: ServerEvent;
}

export interface Scenario {
	/** If set, the scenario auto-plays on connect with this as the user message. */
	autoPrompt?: string;
	/** Events replayed automatically on page load (pre-populated history). */
	preload: ServerEvent[];
	/** Events replayed with timing when the user sends a prompt. */
	steps: ScenarioStep[];
	/** If true, the mock transport returns an empty session list (fresh state). */
	emptySessions?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textDeltas(text: string, chunkSize: number, delayMs: number): ScenarioStep[] {
	const steps: ScenarioStep[] = [];
	for (let i = 0; i < text.length; i += chunkSize) {
		steps.push({
			delay: delayMs,
			event: {
				type: "message_update",
				message: { role: "assistant", content: [], timestamp: Date.now() },
				assistantMessageEvent: { type: "text_delta", delta: text.slice(i, i + chunkSize) },
			},
		});
	}
	return steps;
}

function thinkingDeltas(text: string, chunkSize: number, delayMs: number): ScenarioStep[] {
	const steps: ScenarioStep[] = [];
	for (let i = 0; i < text.length; i += chunkSize) {
		steps.push({
			delay: delayMs,
			event: {
				type: "message_update",
				message: { role: "assistant", content: [], timestamp: Date.now() },
				assistantMessageEvent: { type: "thinking_delta", delta: text.slice(i, i + chunkSize) },
			},
		});
	}
	return steps;
}

const MSG_STUB: { role: "assistant"; content: []; timestamp: number } = {
	role: "assistant",
	content: [],
	timestamp: Date.now(),
};

// ---------------------------------------------------------------------------
// Default scenario: thinking -> tool call -> tool result -> streamed answer
// ---------------------------------------------------------------------------

const DEFAULT_THINKING =
	"The user said hi. I should read the project README to understand the codebase before responding. Let me check what files are available and provide a helpful overview of the project structure.";

const DEFAULT_ANSWER = `Hello! I've read the project README. Here's a quick summary:

**Project**: pi-monorepo (v0.52.9)
- \`packages/ai\` — LLM streaming client (multi-provider)
- \`packages/agent\` — Core agent loop (tools, extensions, sessions)
- \`packages/coding-agent\` — CLI coding assistant (TUI, RPC, web modes)
- \`packages/tui\` — Terminal UI components (Ink-based)
- \`packages/web-ui\` — Browser UI components (Lit-based)
- \`packages/mom\` — Multi-agent orchestration
- \`packages/pods\` — Sandboxed execution environments

What would you like to work on?`;

const defaultScenario: Scenario = {
	autoPrompt: "Hi, show me the project structure",
	preload: [],
	steps: [
		{ delay: 100, event: { type: "agent_start" } },
		// Turn 1: thinking + tool call
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "thinking_start" },
			},
		},
		...thinkingDeltas(DEFAULT_THINKING, 12, 30),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "thinking_end", content: DEFAULT_THINKING },
			},
		},
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: { type: "toolCall", id: "tc_1", name: "read", arguments: { path: "README.md" } },
				},
			},
		},
		{
			delay: 100,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: DEFAULT_THINKING },
						{ type: "toolCall", id: "tc_1", name: "read", arguments: { path: "README.md" } },
					],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "read" } },
		{
			delay: 400,
			event: {
				type: "tool_execution_end",
				toolName: "read",
				result: {
					content: [
						{
							type: "text",
							text: "# pi-monorepo\n\nA modular AI agent framework...\n\n## Packages\n- ai\n- agent\n- coding-agent\n- tui\n- web-ui\n- mom\n- pods",
						},
					],
				},
				isError: false,
			},
		},
		// Turn 2: streamed answer
		{
			delay: 100,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_start" },
			},
		},
		...textDeltas(DEFAULT_ANSWER, 8, 25),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_end", content: DEFAULT_ANSWER },
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: DEFAULT_ANSWER }],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "agent_end" } },
	],
};

// ---------------------------------------------------------------------------
// Error scenario: prompt fails mid-stream
// ---------------------------------------------------------------------------

const errorScenario: Scenario = {
	autoPrompt: "Do something complex",
	preload: [],
	steps: [
		{ delay: 100, event: { type: "agent_start" } },
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "thinking_start" },
			},
		},
		...thinkingDeltas("Analyzing the request...", 8, 30),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "thinking_end", content: "Analyzing the request..." },
			},
		},
		{
			delay: 200,
			event: {
				type: "extension_error",
				error: "Provider rate limit exceeded. Please wait 30 seconds and try again.",
			},
		},
		{ delay: 50, event: { type: "agent_end" } },
	],
};

// ---------------------------------------------------------------------------
// Multi-tool scenario: multiple sequential tool calls
// ---------------------------------------------------------------------------

const MULTI_TOOL_THINKING =
	"The user wants to see the package.json. I'll read it, then check the tsconfig too for a complete picture.";

const MULTI_TOOL_ANSWER = `Here's what I found:

**package.json** — ESM project, private monorepo using pnpm workspaces.

**tsconfig.json** — Strict mode enabled, ES2022 target, paths mapped to \`packages/*\`.

The setup looks standard for a modern TypeScript monorepo. Want me to check anything specific?`;

const multiToolScenario: Scenario = {
	autoPrompt: "Show me the project config",
	preload: [],
	steps: [
		{ delay: 100, event: { type: "agent_start" } },
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "thinking_start" },
			},
		},
		...thinkingDeltas(MULTI_TOOL_THINKING, 10, 25),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "thinking_end", content: MULTI_TOOL_THINKING },
			},
		},
		// Tool 1: read package.json
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: { type: "toolCall", id: "tc_1", name: "read", arguments: { path: "package.json" } },
				},
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", id: "tc_1", name: "read", arguments: { path: "package.json" } }],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "read" } },
		{
			delay: 300,
			event: {
				type: "tool_execution_end",
				toolName: "read",
				result: {
					content: [
						{ type: "text", text: '{"name":"pi-monorepo","private":true,"type":"module","version":"0.52.9"}' },
					],
				},
				isError: false,
			},
		},
		// Tool 2: read tsconfig.json
		{
			delay: 100,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: { type: "toolCall", id: "tc_2", name: "read", arguments: { path: "tsconfig.json" } },
				},
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", id: "tc_2", name: "read", arguments: { path: "tsconfig.json" } }],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "read" } },
		{
			delay: 250,
			event: {
				type: "tool_execution_end",
				toolName: "read",
				result: {
					content: [
						{ type: "text", text: '{"compilerOptions":{"strict":true,"target":"ES2022","module":"NodeNext"}}' },
					],
				},
				isError: false,
			},
		},
		// Tool 3: bash command
		{
			delay: 100,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: { type: "toolCall", id: "tc_3", name: "bash", arguments: { command: "ls packages/" } },
				},
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", id: "tc_3", name: "bash", arguments: { command: "ls packages/" } }],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "bash" } },
		{
			delay: 500,
			event: {
				type: "tool_execution_end",
				toolName: "bash",
				result: {
					content: [{ type: "text", text: "ai\nagent\ncoding-agent\ncoding-agent-web\nmom\npods\ntui\nweb-ui" }],
				},
				isError: false,
			},
		},
		// Final answer
		{
			delay: 100,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_start" },
			},
		},
		...textDeltas(MULTI_TOOL_ANSWER, 6, 25),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_end", content: MULTI_TOOL_ANSWER },
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: MULTI_TOOL_ANSWER }],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "agent_end" } },
	],
};

// ---------------------------------------------------------------------------
// Long scenario: extensive streamed response to test scrolling
// ---------------------------------------------------------------------------

const LONG_TEXT = `# Architecture Overview

## 1. Core Abstractions

The system is built around a few key abstractions that compose together:

### Agent Loop
The agent loop is the central coordination mechanism. It:
1. Receives a user prompt
2. Sends it to the LLM along with available tools
3. Processes the LLM response (text, tool calls, or both)
4. Executes any requested tool calls
5. Feeds results back to the LLM
6. Repeats until the LLM produces a final text response

### Sessions
Each conversation is a **session**. Sessions form a tree structure where:
- The root is the initial conversation
- Branches are created via "fork" operations
- Each node contains a message (user, assistant, or tool result)
- Navigation moves up/down/between branches

### Tools
Tools are the agent's capabilities. Each tool has:
- A name and description (for the LLM)
- A JSON schema for parameters
- An execute function that performs the action
- Optional confirmation requirements

Built-in tools include: \`read\`, \`write\`, \`edit\`, \`bash\`, \`glob\`, \`grep\`.

## 2. Transport Layers

The coding agent supports three modes:

### TUI Mode (default)
Terminal UI using Ink (React for terminals). Features:
- Streaming text with markdown rendering
- Tool execution progress indicators
- Session tree navigation
- Extension UI integration

### RPC Mode
JSON-over-stdio protocol for programmatic control:
- Request/response with correlation IDs
- Server-sent events for streaming updates
- Full session management API
- Extension UI bridging

### Web Mode
HTTP + WebSocket server for browser-based access:
- Static file serving for the frontend
- WebSocket transport with token authentication
- Origin allowlist for security
- Same event protocol as RPC mode

## 3. Extension System

Extensions add custom commands and UI elements:
- Loaded from \`.pi/extensions/\` directories
- Can register slash commands
- Have access to UI methods (select, confirm, input, notify)
- Can modify editor state and set status widgets

## 4. Provider Abstraction

The AI layer supports multiple LLM providers through a unified interface:
- OpenAI, Anthropic, Google, AWS Bedrock, Azure, Groq, Mistral, OpenRouter
- Standardized streaming events (text, thinking, tool calls)
- Automatic token counting and context window management
- Cross-provider message format conversion

---

*This is a synthetic response for UI development purposes.*`;

const longScenario: Scenario = {
	autoPrompt: "Explain the architecture",
	preload: [],
	steps: [
		{ delay: 100, event: { type: "agent_start" } },
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_start" },
			},
		},
		...textDeltas(LONG_TEXT, 10, 15),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_end", content: LONG_TEXT },
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: LONG_TEXT }],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "agent_end" } },
	],
};

// ---------------------------------------------------------------------------
// Empty scenario: no auto-prompt, shows the initial empty state
// ---------------------------------------------------------------------------

const emptyScenario: Scenario = {
	preload: [],
	steps: [],
	emptySessions: true,
};

// ---------------------------------------------------------------------------
// Interleaved scenario: text and tool calls alternate across multiple turns
// ---------------------------------------------------------------------------

const INTERLEAVED_TEXT_1 = "Let me read the CSS file to understand the current styles.";

const INTERLEAVED_TEXT_2 =
	"I see the issue. Tailwind's preflight resets `list-style: none` on all `ul` / `ol`. Let me fix that.";

const INTERLEAVED_TEXT_3 = "Now let me verify visually that the fix works correctly.";

const INTERLEAVED_TEXT_4 =
	"The bullet points and numbered lists are now rendering correctly. The fix restores `list-style-type` for markdown content.";

const interleavedScenario: Scenario = {
	autoPrompt: "Fix the missing bullet points in markdown lists",
	preload: [],
	steps: [
		{ delay: 100, event: { type: "agent_start" } },
		// Turn 1: text + read tool call
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_start" },
			},
		},
		...textDeltas(INTERLEAVED_TEXT_1, 8, 20),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_end", content: INTERLEAVED_TEXT_1 },
			},
		},
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: { type: "toolCall", id: "tc_1", name: "read", arguments: { path: "src/index.css" } },
				},
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: INTERLEAVED_TEXT_1 },
						{ type: "toolCall", id: "tc_1", name: "read", arguments: { path: "src/index.css" } },
					],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "read" } },
		{
			delay: 300,
			event: {
				type: "tool_execution_end",
				toolName: "read",
				result: {
					content: [{ type: "text", text: "@tailwind base;\n@tailwind components;\n@tailwind utilities;" }],
				},
				isError: false,
			},
		},
		// Turn 2: text + edit tool call
		{
			delay: 100,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_start" },
			},
		},
		...textDeltas(INTERLEAVED_TEXT_2, 8, 20),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_end", content: INTERLEAVED_TEXT_2 },
			},
		},
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: {
						type: "toolCall",
						id: "tc_2",
						name: "edit",
						arguments: {
							path: "src/index.css",
							oldText: "@tailwind utilities;",
							newText: "@tailwind utilities;\n\n.markdown ul { list-style-type: disc; }",
						},
					},
				},
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: INTERLEAVED_TEXT_2 },
						{
							type: "toolCall",
							id: "tc_2",
							name: "edit",
							arguments: {
								path: "src/index.css",
								oldText: "@tailwind utilities;",
								newText: "@tailwind utilities;\n\n.markdown ul { list-style-type: disc; }",
							},
						},
					],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "edit" } },
		{
			delay: 200,
			event: {
				type: "tool_execution_end",
				toolName: "edit",
				result: { content: [{ type: "text", text: "OK" }] },
				isError: false,
			},
		},
		// Turn 3: text + bash tool call
		{
			delay: 100,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_start" },
			},
		},
		...textDeltas(INTERLEAVED_TEXT_3, 8, 20),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_end", content: INTERLEAVED_TEXT_3 },
			},
		},
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: { type: "toolCall", id: "tc_3", name: "bash", arguments: { command: "npm run check" } },
				},
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: INTERLEAVED_TEXT_3 },
						{ type: "toolCall", id: "tc_3", name: "bash", arguments: { command: "npm run check" } },
					],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "bash" } },
		{
			delay: 500,
			event: {
				type: "tool_execution_end",
				toolName: "bash",
				result: { content: [{ type: "text", text: "All checks passed." }] },
				isError: false,
			},
		},
		// Turn 4: final text answer
		{
			delay: 100,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_start" },
			},
		},
		...textDeltas(INTERLEAVED_TEXT_4, 8, 20),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_end", content: INTERLEAVED_TEXT_4 },
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: INTERLEAVED_TEXT_4 }],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "agent_end" } },
	],
};

// ---------------------------------------------------------------------------
// In-progress scenario: pauses mid-stream so the streaming dot is visible
// ---------------------------------------------------------------------------

const IN_PROGRESS_TEXT = "Let me check the configuration files.";

const inProgressScenario: Scenario = {
	autoPrompt: "Check the project config",
	preload: [],
	steps: [
		{ delay: 100, event: { type: "agent_start" } },
		// Text before tool calls
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_start" },
			},
		},
		...textDeltas(IN_PROGRESS_TEXT, 8, 20),
		{
			delay: 20,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "text_end", content: IN_PROGRESS_TEXT },
			},
		},
		// Tool call 1: completed
		{
			delay: 50,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: { type: "toolCall", id: "tc_ip_1", name: "read", arguments: { path: "package.json" } },
				},
			},
		},
		{
			delay: 50,
			event: {
				type: "message_end",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: IN_PROGRESS_TEXT },
						{ type: "toolCall", id: "tc_ip_1", name: "read", arguments: { path: "package.json" } },
					],
					timestamp: Date.now(),
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "read" } },
		{
			delay: 300,
			event: {
				type: "tool_execution_end",
				toolName: "read",
				result: {
					content: [{ type: "text", text: '{"name":"my-project","version":"1.0.0"}' }],
				},
				isError: false,
			},
		},
		// Tool call 2: stays in "running" phase — never completes
		{
			delay: 100,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: { type: "toolcall_start" },
			},
		},
		{
			delay: 80,
			event: {
				type: "message_update",
				message: MSG_STUB,
				assistantMessageEvent: {
					type: "toolcall_end",
					toolCall: { type: "toolCall", id: "tc_ip_2", name: "bash", arguments: { command: "npm run check" } },
				},
			},
		},
		{ delay: 50, event: { type: "tool_execution_start", toolName: "bash" } },
		// No tool_execution_end, no agent_end — stays in streaming state
	],
};

// ---------------------------------------------------------------------------
// Thinking scenario: agent started but no output yet, just the streaming dot
// ---------------------------------------------------------------------------

const thinkingScenario: Scenario = {
	autoPrompt: "What is this project?",
	preload: [],
	steps: [
		{ delay: 100, event: { type: "agent_start" } },
		// No further events — stays in streaming state with no output
	],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SCENARIOS: Record<string, Scenario> = {
	default: defaultScenario,
	empty: emptyScenario,
	error: errorScenario,
	"multi-tool": multiToolScenario,
	long: longScenario,
	interleaved: interleavedScenario,
	"in-progress": inProgressScenario,
	thinking: thinkingScenario,
};
