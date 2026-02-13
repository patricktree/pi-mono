import "./ui/pi-web-app.js";

const app = document.getElementById("app");
if (!app) {
	throw new Error("Could not find #app root element");
}

document.documentElement.style.height = "100%";
document.body.style.height = "100%";
document.body.style.margin = "0";

const webApp = document.createElement("pi-web-app");
app.appendChild(webApp);
