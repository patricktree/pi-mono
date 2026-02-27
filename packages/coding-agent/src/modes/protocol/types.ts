/**
 * Shared protocol types.
 *
 * Re-exports the RPC extension UI types so transports (stdio/ws) can import
 * from a single location without coupling to the rpc/ directory.
 */

export type { RpcExtensionUIRequest, RpcExtensionUIResponse } from "../rpc/rpc-types.js";
