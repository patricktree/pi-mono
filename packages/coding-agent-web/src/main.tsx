import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./index.css";

const app = document.getElementById("app");
if (!app) {
	throw new Error("Could not find #app root element");
}

createRoot(app).render(<App />);
