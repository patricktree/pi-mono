# Draft: RPC protocol additions for Web mode parity

This is an **additive** draft for `packages/coding-agent/src/modes/rpc/rpc-types.ts` and `rpc-mode.ts` command handling.

---

## `rpc-types.ts` additions

```ts
// add imports
import type { AgentSessionEvent } from "../../core/agent-session.js";

// ============================================================================
// New shared protocol structs
// ============================================================================

export interface RpcSessionSummary {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: string; // ISO string
  modified: string; // ISO string
  messageCount: number;
  firstMessage: string;
  allMessagesText: string;
}

export interface RpcSessionTreeEntry {
  id: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  label?: string;
  preview?: string; // short user/assistant preview text for UI tree list
}

export interface RpcSessionTreeNode {
  entry: RpcSessionTreeEntry;
  children: RpcSessionTreeNode[];
}

export interface RpcSessionTree {
  leafId: string | null;
  nodes: RpcSessionTreeNode[];
}

export interface RpcContextUsage {
  tokens: number;
  contextWindow: number;
  percent: number;
  usageTokens: number;
  trailingTokens: number;
  lastUsageIndex: number | null;
}

export interface RpcToolInfo {
  name: string;
  description: string;
  parameters: unknown;
}

// ============================================================================
// RPC Commands (stdin) - ADD to RpcCommand union
// ============================================================================

/*
| { id?: string; type: "list_sessions"; scope?: "cwd" | "all"; sessionDir?: string }
| { id?: string; type: "get_session_tree" }
| {
		id?: string;
		type: "navigate_tree";
		targetId: string;
		summarize?: boolean;
		customInstructions?: string;
		replaceInstructions?: boolean;
		label?: string;
  }
| { id?: string; type: "set_entry_label"; targetId: string; label?: string }
| { id?: string; type: "reload_resources" }
| { id?: string; type: "get_context_usage" }
| { id?: string; type: "get_tools" }
| { id?: string; type: "set_active_tools"; toolNames: string[] }
*/

// ============================================================================
// RPC Responses (stdout) - ADD to RpcResponse union
// ============================================================================

/*
| {
		id?: string;
		type: "response";
		command: "list_sessions";
		success: true;
		data: { sessions: RpcSessionSummary[] };
  }
| {
		id?: string;
		type: "response";
		command: "get_session_tree";
		success: true;
		data: RpcSessionTree;
  }
| {
		id?: string;
		type: "response";
		command: "navigate_tree";
		success: true;
		data: { cancelled: boolean; editorText?: string };
  }
| {
		id?: string;
		type: "response";
		command: "set_entry_label";
		success: true;
  }
| {
		id?: string;
		type: "response";
		command: "reload_resources";
		success: true;
		data: { commands: RpcSlashCommand[] };
  }
| {
		id?: string;
		type: "response";
		command: "get_context_usage";
		success: true;
		data: { usage?: RpcContextUsage };
  }
| {
		id?: string;
		type: "response";
		command: "get_tools";
		success: true;
		data: { activeToolNames: string[]; allTools: RpcToolInfo[] };
  }
| {
		id?: string;
		type: "response";
		command: "set_active_tools";
		success: true;
		data: { activeToolNames: string[] };
  }
*/

// ============================================================================
// Additional server-pushed events (stdout)
// ============================================================================

export type RpcSessionChangedEvent = {
  type: "session_changed";
  reason: "new" | "switch" | "fork" | "tree" | "reload";
  sessionId: string;
  sessionFile?: string;
  sessionName?: string;
  messageCount: number;
  leafId: string | null;
};

export type RpcQueueChangedEvent = {
  type: "queue_changed";
  pendingMessageCount: number;
};

export type RpcExtensionErrorEvent = {
  type: "extension_error";
  extensionPath: string;
  event: string;
  error: string;
};

// Unified stream events for WebSocket clients (optional but useful)
export type RpcServerEvent =
  | AgentSessionEvent
  | RpcExtensionUIRequest
  | RpcSessionChangedEvent
  | RpcQueueChangedEvent
  | RpcExtensionErrorEvent;
```

---

## `rpc-mode.ts` command mapping notes

Add `handleCommand` cases:

- `list_sessions`
  - `scope === "all"` → `SessionManager.listAll(...)`
  - else → `SessionManager.list(process.cwd(), command.sessionDir, ...)`
- `get_session_tree`
  - build from `session.sessionManager.getTree()` + `getLeafId()` + labels/previews
- `navigate_tree`
  - map to `session.navigateTree(targetId, { summarize, customInstructions, replaceInstructions, label })`
- `set_entry_label`
  - `session.sessionManager.appendLabelChange(targetId, label)`
- `reload_resources`
  - `await session.reload()`
  - optionally return `get_commands` payload snapshot
- `get_context_usage`
  - `session.getContextUsage()`
- `get_tools`
  - `session.getActiveToolNames()` + `session.getAllTools()`
- `set_active_tools`
  - `session.setActiveToolsByName(command.toolNames)` then return active tool names

Emit `session_changed` after successful:

- `new_session`
- `switch_session`
- `fork`
- `navigate_tree`
- `reload_resources`

Optional: emit `queue_changed` when pending queue count changes.

---

## Compatibility notes

- Keep all current RPC commands/events unchanged.
- Keep extension UI sub-protocol unchanged (`extension_ui_request` / `extension_ui_response`).
- New commands are additive for web parity and can also benefit richer non-web RPC clients.

---

## Exact `rpc-mode.ts` switch cases (copy-paste draft)

### 1) Imports

Add to imports at top of `rpc-mode.ts`:

```ts
import { SessionManager } from "../../core/session-manager.js";
```

Extend `rpc-types` imports:

```ts
import type {
  RpcCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse,
  RpcSessionState,
  RpcSlashCommand,
  RpcSessionSummary,
  RpcSessionTree,
  RpcSessionTreeEntry,
  RpcSessionTreeNode,
  RpcToolInfo,
} from "./rpc-types.js";
```

### 2) Helpers inside `runRpcMode()`

Place before `handleCommand`:

```ts
const getCommandsSnapshot = (): RpcSlashCommand[] => {
  const commands: RpcSlashCommand[] = [];

  for (const {
    command,
    extensionPath,
  } of session.extensionRunner?.getRegisteredCommandsWithPaths() ?? []) {
    commands.push({
      name: command.name,
      description: command.description,
      source: "extension",
      path: extensionPath,
    });
  }

  for (const template of session.promptTemplates) {
    commands.push({
      name: template.name,
      description: template.description,
      source: "prompt",
      location: template.source as RpcSlashCommand["location"],
      path: template.filePath,
    });
  }

  for (const skill of session.resourceLoader.getSkills().skills) {
    commands.push({
      name: `skill:${skill.name}`,
      description: skill.description,
      source: "skill",
      location: skill.source as RpcSlashCommand["location"],
      path: skill.filePath,
    });
  }

  return commands;
};

const emitSessionChanged = (
  reason: "new" | "switch" | "fork" | "tree" | "reload",
) => {
  output({
    type: "session_changed",
    reason,
    sessionId: session.sessionId,
    sessionFile: session.sessionFile,
    sessionName: session.sessionName,
    messageCount: session.messages.length,
    leafId: session.sessionManager.getLeafId(),
  });
};

const extractPreviewText = (entry: any): string | undefined => {
  if (!entry || typeof entry !== "object") return undefined;

  if (entry.type === "message") {
    const msg = entry.message;
    if (!msg) return undefined;

    if (msg.role === "user") {
      if (typeof msg.content === "string") return msg.content.slice(0, 140);
      if (Array.isArray(msg.content)) {
        const text = msg.content
          .filter((c: any) => c?.type === "text" && typeof c.text === "string")
          .map((c: any) => c.text)
          .join(" ");
        return text.slice(0, 140) || undefined;
      }
      return undefined;
    }

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const text = msg.content
        .filter((c: any) => c?.type === "text" && typeof c.text === "string")
        .map((c: any) => c.text)
        .join(" ");
      return text.slice(0, 140) || undefined;
    }

    if (msg.role === "toolResult") {
      return `[toolResult:${msg.toolName}]`;
    }
  }

  if (entry.type === "compaction") return "[compaction]";
  if (entry.type === "branch_summary") return "[branch_summary]";
  if (entry.type === "custom_message") return "[custom_message]";
  if (entry.type === "custom") return "[custom]";
  if (entry.type === "model_change")
    return `[model:${entry.provider}/${entry.modelId}]`;
  if (entry.type === "thinking_level_change")
    return `[thinking:${entry.thinkingLevel}]`;
  if (entry.type === "label") return `[label:${entry.label ?? ""}]`;
  if (entry.type === "session_info")
    return `[session_info:${entry.name ?? ""}]`;

  return undefined;
};

const mapTreeNode = (node: any): RpcSessionTreeNode => {
  const entry: RpcSessionTreeEntry = {
    id: node.entry.id,
    parentId: node.entry.parentId,
    type: node.entry.type,
    timestamp: node.entry.timestamp,
    label: node.label,
    preview: extractPreviewText(node.entry),
  };

  return {
    entry,
    children: (node.children ?? []).map((child: any) => mapTreeNode(child)),
  };
};
```

### 3) Switch case updates

Update existing session-changing cases:

```ts
case "new_session": {
	const options = command.parentSession ? { parentSession: command.parentSession } : undefined;
	const cancelled = !(await session.newSession(options));
	if (!cancelled) {
		emitSessionChanged("new");
	}
	return success(id, "new_session", { cancelled });
}
```

```ts
case "switch_session": {
	const cancelled = !(await session.switchSession(command.sessionPath));
	if (!cancelled) {
		emitSessionChanged("switch");
	}
	return success(id, "switch_session", { cancelled });
}
```

```ts
case "fork": {
	const result = await session.fork(command.entryId);
	if (!result.cancelled) {
		emitSessionChanged("fork");
	}
	return success(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
}
```

Add new command cases:

```ts
case "list_sessions": {
	const scope = command.scope ?? "cwd";
	const sessions =
		scope === "all"
			? await SessionManager.listAll()
			: await SessionManager.list(session.sessionManager.getCwd(), command.sessionDir);

	const data: RpcSessionSummary[] = sessions.map((s) => ({
		path: s.path,
		id: s.id,
		cwd: s.cwd,
		name: s.name,
		parentSessionPath: s.parentSessionPath,
		created: s.created.toISOString(),
		modified: s.modified.toISOString(),
		messageCount: s.messageCount,
		firstMessage: s.firstMessage,
		allMessagesText: s.allMessagesText,
	}));

	return success(id, "list_sessions", { sessions: data });
}
```

```ts
case "get_session_tree": {
	const roots = session.sessionManager.getTree();
	const tree: RpcSessionTree = {
		leafId: session.sessionManager.getLeafId(),
		nodes: roots.map((n) => mapTreeNode(n)),
	};
	return success(id, "get_session_tree", tree);
}
```

```ts
case "navigate_tree": {
	const result = await session.navigateTree(command.targetId, {
		summarize: command.summarize,
		customInstructions: command.customInstructions,
		replaceInstructions: command.replaceInstructions,
		label: command.label,
	});

	if (!result.cancelled) {
		emitSessionChanged("tree");
	}

	return success(id, "navigate_tree", {
		cancelled: result.cancelled,
		editorText: result.editorText,
	});
}
```

```ts
case "set_entry_label": {
	const normalized = command.label?.trim();
	session.sessionManager.appendLabelChange(command.targetId, normalized ? normalized : undefined);
	return success(id, "set_entry_label");
}
```

```ts
case "reload_resources": {
	await session.reload();
	emitSessionChanged("reload");
	return success(id, "reload_resources", { commands: getCommandsSnapshot() });
}
```

```ts
case "get_context_usage": {
	const usage = session.getContextUsage();
	return success(id, "get_context_usage", { usage });
}
```

```ts
case "get_tools": {
	const activeToolNames = session.getActiveToolNames();
	const allTools: RpcToolInfo[] = session.getAllTools().map((t) => ({
		name: t.name,
		description: t.description,
		parameters: t.parameters,
	}));
	return success(id, "get_tools", { activeToolNames, allTools });
}
```

```ts
case "set_active_tools": {
	session.setActiveToolsByName(command.toolNames);
	return success(id, "set_active_tools", {
		activeToolNames: session.getActiveToolNames(),
	});
}
```

Optional cleanup for `get_commands`:

```ts
case "get_commands": {
	return success(id, "get_commands", { commands: getCommandsSnapshot() });
}
```

---

## Matching `rpc-client.ts` method additions (copy-paste draft)

### 1) Import new response/data types

Update imports from `./rpc-types.js`:

```ts
import type {
  RpcCommand,
  RpcResponse,
  RpcSessionState,
  RpcSlashCommand,
  RpcContextUsage,
  RpcSessionSummary,
  RpcSessionTree,
  RpcToolInfo,
} from "./rpc-types.js";
```

### 2) Add methods in `RpcClient` command methods section

```ts
/**
 * List available sessions.
 * - scope: "cwd" (default) lists sessions for the current working directory
 * - scope: "all" lists sessions across all directories
 */
async listSessions(options?: {
	scope?: "cwd" | "all";
	sessionDir?: string;
}): Promise<RpcSessionSummary[]> {
	const response = await this.send({
		type: "list_sessions",
		scope: options?.scope,
		sessionDir: options?.sessionDir,
	});
	return this.getData<{ sessions: RpcSessionSummary[] }>(response).sessions;
}

/**
 * Get the current session tree and active leaf.
 */
async getSessionTree(): Promise<RpcSessionTree> {
	const response = await this.send({ type: "get_session_tree" });
	return this.getData<RpcSessionTree>(response);
}

/**
 * Navigate to a different node in the session tree.
 */
async navigateTree(
	targetId: string,
	options?: {
		summarize?: boolean;
		customInstructions?: string;
		replaceInstructions?: boolean;
		label?: string;
	},
): Promise<{ cancelled: boolean; editorText?: string }> {
	const response = await this.send({
		type: "navigate_tree",
		targetId,
		summarize: options?.summarize,
		customInstructions: options?.customInstructions,
		replaceInstructions: options?.replaceInstructions,
		label: options?.label,
	});
	return this.getData<{ cancelled: boolean; editorText?: string }>(response);
}

/**
 * Set or clear label on a session entry.
 */
async setEntryLabel(targetId: string, label?: string): Promise<void> {
	await this.send({ type: "set_entry_label", targetId, label });
}

/**
 * Reload extensions/resources and return refreshed slash command snapshot.
 */
async reloadResources(): Promise<RpcSlashCommand[]> {
	const response = await this.send({ type: "reload_resources" });
	return this.getData<{ commands: RpcSlashCommand[] }>(response).commands;
}

/**
 * Get current context window usage.
 */
async getContextUsage(): Promise<RpcContextUsage | undefined> {
	const response = await this.send({ type: "get_context_usage" });
	return this.getData<{ usage?: RpcContextUsage }>(response).usage;
}

/**
 * Get all available tools and currently active tool names.
 */
async getTools(): Promise<{ activeToolNames: string[]; allTools: RpcToolInfo[] }> {
	const response = await this.send({ type: "get_tools" });
	return this.getData<{ activeToolNames: string[]; allTools: RpcToolInfo[] }>(response);
}

/**
 * Set active tools and return resulting active tool names.
 */
async setActiveTools(toolNames: string[]): Promise<string[]> {
	const response = await this.send({ type: "set_active_tools", toolNames });
	return this.getData<{ activeToolNames: string[] }>(response).activeToolNames;
}
```

### 3) Optional event typing update (recommended)

If the server emits non-`AgentEvent` events (e.g. `session_changed`), widen listener typing.

```ts
import type { RpcServerEvent } from "./rpc-types.js";

export type RpcEventListener = (event: RpcServerEvent) => void;
```

If you keep `RpcEventListener = (event: AgentEvent) => void`, new server-pushed events will still arrive at runtime but be incorrectly typed.
