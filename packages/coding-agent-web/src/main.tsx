import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const app = document.getElementById("app");
if (!app) {
	throw new Error("Could not find #app root element");
}

const queryClient = new QueryClient();

createRoot(app).render(
	<QueryClientProvider client={queryClient}>
		<App />
	</QueryClientProvider>,
);
