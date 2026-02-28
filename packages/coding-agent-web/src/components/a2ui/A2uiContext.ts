import { createContext, useContext } from "react";
import type { DataModel } from "./data-model.js";
import type { A2uiAction, A2uiComponentDef } from "./types.js";

export interface A2uiContextValue {
	components: Map<string, A2uiComponentDef>;
	dataModel: DataModel;
	interactive: boolean;
	/** Base path for data binding (used inside templates for scoped paths). */
	dataBasePath: string;
	onAction: (action: A2uiAction) => void;
}

export const A2uiContext = createContext<A2uiContextValue | null>(null);

export function useA2ui(): A2uiContextValue {
	const ctx = useContext(A2uiContext);
	if (!ctx) throw new Error("useA2ui must be used inside <A2uiContext.Provider>");
	return ctx;
}
