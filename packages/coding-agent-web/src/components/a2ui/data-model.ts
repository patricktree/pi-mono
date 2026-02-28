// ---------------------------------------------------------------------------
// Minimal reactive data model for A2UI — JSON Pointer path resolution
// ---------------------------------------------------------------------------

type Listener = () => void;

/**
 * Simple observable data store for A2UI surfaces.
 * Stores data as a plain object and notifies listeners on changes.
 */
export class DataModel {
	private data: Record<string, unknown> = {};
	private listeners = new Set<Listener>();

	/** Replace or merge data at a path. */
	set(path: string | undefined, value: unknown): void {
		if (!path || path === "/") {
			if (typeof value === "object" && value !== null && !Array.isArray(value)) {
				this.data = value as Record<string, unknown>;
			}
		} else {
			const segments = parsePath(path);
			if (segments.length === 0) return;

			const lastSegment = segments.pop()!;
			let current: Record<string, unknown> = this.data;

			for (const segment of segments) {
				if (current[segment] === undefined || current[segment] === null || typeof current[segment] !== "object") {
					current[segment] = {};
				}
				current = current[segment] as Record<string, unknown>;
			}

			current[lastSegment] = value;
		}
		this.notify();
	}

	/** Get data at a JSON Pointer path. */
	get(path: string): unknown {
		if (!path || path === "/") return this.data;
		const segments = parsePath(path);
		let current: unknown = this.data;
		for (const segment of segments) {
			if (current === undefined || current === null) return undefined;
			current = (current as Record<string, unknown>)[segment];
		}
		return current;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

function parsePath(path: string): string[] {
	return path.split("/").filter((s) => s.length > 0);
}
