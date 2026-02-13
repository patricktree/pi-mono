/**
 * Shared protocol types.
 *
 * Re-exports all RPC protocol types so transports (stdio/ws) can import from
 * a single location without coupling to the rpc/ directory.
 */

export type {
	RpcCommand,
	RpcCommandType,
	RpcContextUsage,
	RpcExtensionErrorEvent,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcQueueChangedEvent,
	RpcResponse,
	RpcServerEvent,
	RpcSessionChangedEvent,
	RpcSessionState,
	RpcSessionSummary,
	RpcSessionTree,
	RpcSessionTreeEntry,
	RpcSessionTreeNode,
	RpcSlashCommand,
	RpcToolInfo,
} from "../rpc/rpc-types.js";
