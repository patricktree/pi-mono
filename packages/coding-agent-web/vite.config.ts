import react from "@vitejs/plugin-react-swc";
import wyw from "@wyw-in-js/vite";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), wyw({ include: ["**/*.{ts,tsx}"] })],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
