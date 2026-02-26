import { defineConfig, devices } from "@playwright/test";

const PLAYWRIGHT_VERSION = "1.58.2";
const PLAYWRIGHT_SERVER_PORT_ENV = "PLAYWRIGHT_SERVER_PORT";

const isDebug = process.env.PWDEBUG === "1";
const isCI = !!process.env.CI;
const useDocker = !isDebug;

export default defineConfig({
	testDir: "./test",
	fullyParallel: true,
	forbidOnly: isCI,
	retries: isCI ? 2 : 0,
	reporter: isCI ? [["html", { open: "never" }], ["github"]] : [["html", { open: "never" }]],

	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				channel: "chromium",
			},
		},
	],

	snapshotPathTemplate: `{testDir}/../snapshots/{testFilePath}/{arg}-{projectName}-${
		useDocker ? "docker" : "{platform}"
	}{ext}`,

	expect: {
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.03,
			animations: "disabled",
		},
	},

	use: {
		baseURL: "http://localhost:4173",
		trace: "on-first-retry",

		connectOptions: useDocker
			? {
					wsEndpoint: `ws://127.0.0.1:${process.env[PLAYWRIGHT_SERVER_PORT_ENV] ?? ""}/`,
				}
			: undefined,
	},

	webServer: [
		{
			command: "npx vite preview --port 4173 --strict-port",
			port: 4173,
			reuseExistingServer: !isCI,
		},
		...(useDocker
			? [
					{
						command: `docker run --rm --init --workdir /home/pwuser --user pwuser --network host mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble /bin/sh -c "npx -y playwright@${PLAYWRIGHT_VERSION} run-server --host 0.0.0.0"`,
						wait: {
							stdout: new RegExp(
								String.raw`Listening on ws:\/\/0\.0\.0\.0:(?<${PLAYWRIGHT_SERVER_PORT_ENV}>\d+)`,
							),
						},
						stdout: "pipe" as const,
						stderr: "pipe" as const,
						timeout: 60_000,
						gracefulShutdown: {
							signal: "SIGTERM" as const,
							timeout: 10_000,
						},
						reuseExistingServer: !isCI,
					},
				]
			: []),
	],
});
