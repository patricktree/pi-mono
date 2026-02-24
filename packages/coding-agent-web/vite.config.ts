import react from "@vitejs/plugin-react-swc";
import wyw from "@wyw-in-js/vite";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	plugins: [
		react(),
		wyw({
			include: ["**/*.{ts,tsx}"],
			displayName: mode === "development",
			...(mode === "development" && {
				classNameSlug: "[name]__[title]__[hash]",
			}),
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		proxy: {
			"/ws": {
				target: "ws://127.0.0.1:4781",
				ws: true,
			},
		},
	},
}));
