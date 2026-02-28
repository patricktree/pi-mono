import "./styles/animations.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const app = document.getElementById("app");
if (!app) {
	throw new Error("Could not find #app root element");
}

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			/**
			 * All live data arrives through the WebSocket (via setQueryData or
			 * invalidation), so queries never need to auto-refetch based on
			 * staleness. Refetches only happen through explicit invalidation.
			 *
			 * @see {@link https://tkdodo.eu/blog/using-web-sockets-with-react-query}
			 */
			staleTime: Infinity,
		},
	},
});

if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("/sw.js");
}

createRoot(app).render(
	<QueryClientProvider client={queryClient}>
		<App />
	</QueryClientProvider>,
);
