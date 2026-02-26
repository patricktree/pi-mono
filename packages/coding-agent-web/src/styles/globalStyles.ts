import { css } from "@linaria/core";

export const globalStyles = css`
	:global() {
		/* -------------------------------------------------------------- */
		/* Reset                                                           */
		/* -------------------------------------------------------------- */

		*,
		*::before,
		*::after {
			box-sizing: border-box;
		}

		body,
		h1, h2, h3, h4, h5, h6,
		p, ol, ul, blockquote, pre, figure, hr, dl, dd {
			margin: 0;
		}

		ol, ul {
			list-style: none;
			padding: 0;
		}

		input, button, textarea, select {
			font: inherit;
			color: inherit;
		}

		button {
			background: none;
			border: none;
			padding: 0;
		}

		/* -------------------------------------------------------------- */
		/* Design tokens                                                   */
		/* -------------------------------------------------------------- */

		:root {
			--color-oc-bg: #faf9f7;
			--color-oc-fg: #1a1a2e;
			--color-oc-fg-muted: #71717a;
			--color-oc-fg-faint: #a1a1aa;
			--color-oc-border: #e4e2de;
			--color-oc-border-light: #edebe7;
			--color-oc-card: #ffffff;
			--color-oc-muted-bg: #f3f2ef;
			--color-oc-user-bg: #f5f4f0;
			--color-oc-user-border: #e4e2de;
			--color-oc-accent: #10b981;
			--color-oc-error: #ef4444;
			--color-oc-primary: #1a1a2e;
			--color-oc-primary-fg: #ffffff;
			--color-oc-ring: #3b82f6;
			--radius-oc: 10px;
			--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			--font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
		}

		/* -------------------------------------------------------------- */
		/* Base                                                            */
		/* -------------------------------------------------------------- */

		html, body, #app {
			height: 100%;
			margin: 0;
		}

		body {
			font-family: var(--font-sans);
			background: var(--color-oc-bg);
			color: var(--color-oc-fg);
			font-size: 15px;
			line-height: 1.5;
			-webkit-font-smoothing: antialiased;
		}
	}
`;
