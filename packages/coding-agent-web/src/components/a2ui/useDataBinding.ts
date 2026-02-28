import { useCallback, useSyncExternalStore } from "react";
import type { DataModel } from "./data-model.js";
import type { A2uiBooleanValue, A2uiNumberValue, A2uiStringValue } from "./types.js";

/**
 * Subscribe to a JSON Pointer path in the DataModel and return the current value.
 * Re-renders when the value at that path changes.
 */
export function useDataValue(dataModel: DataModel, path: string): unknown {
	const subscribe = useCallback((onStoreChange: () => void) => dataModel.subscribe(onStoreChange), [dataModel]);
	const getSnapshot = useCallback(() => dataModel.get(path), [dataModel, path]);
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Resolve an A2UI string value (literal or data-bound) to a string. */
export function resolveString(
	value: A2uiStringValue | string | undefined,
	dataModel: DataModel,
	basePath: string,
): string {
	if (value === undefined) return "";
	if (typeof value === "string") return value;
	if (value.literalString !== undefined) return value.literalString;
	if (value.path !== undefined) {
		const fullPath = resolvePath(value.path, basePath);
		const resolved = dataModel.get(fullPath);
		return resolved !== undefined && resolved !== null ? String(resolved) : "";
	}
	return "";
}

/** Resolve an A2UI boolean value. */
export function resolveBoolean(
	value: A2uiBooleanValue | boolean | undefined,
	dataModel: DataModel,
	basePath: string,
): boolean {
	if (value === undefined) return false;
	if (typeof value === "boolean") return value;
	if (value.literalBoolean !== undefined) return value.literalBoolean;
	if (value.path !== undefined) {
		const fullPath = resolvePath(value.path, basePath);
		return Boolean(dataModel.get(fullPath));
	}
	return false;
}

/** Resolve an A2UI number value. */
export function resolveNumber(
	value: A2uiNumberValue | number | undefined,
	dataModel: DataModel,
	basePath: string,
): number {
	if (value === undefined) return 0;
	if (typeof value === "number") return value;
	if (value.literalNumber !== undefined) return value.literalNumber;
	if (value.path !== undefined) {
		const fullPath = resolvePath(value.path, basePath);
		const resolved = dataModel.get(fullPath);
		return typeof resolved === "number" ? resolved : 0;
	}
	return 0;
}

/** Resolve a path relative to basePath for template scoping. */
function resolvePath(path: string, basePath: string): string {
	if (basePath === "/" || basePath === "") return path;
	// If path starts with /, it's absolute
	if (path.startsWith("/")) {
		// But in template context, relative paths are scoped
		// Check if the path is already absolute (starts with basePath)
		if (path.startsWith(basePath)) return path;
		// Otherwise scope it
		return `${basePath}${path}`;
	}
	return `${basePath}/${path}`;
}
