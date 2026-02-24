import { css } from "@linaria/core";
import { useMemo } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";

const MARKDOWN = new Marked({ async: false, gfm: true, breaks: false });

const markdownStyle = css`
	color: var(--color-oc-fg);
	line-height: 1.6;

	& h1, & h2, & h3,
	& h4, & h5, & h6 {
		margin: 0.8rem 0 0.4rem;
		font-weight: 600;
		line-height: 1.3;
	}

	& h1 { font-size: 1.25rem; }
	& h2 { font-size: 1.125rem; }

	& p, & ul, & ol,
	& blockquote, & table, & pre {
		margin: 0.5rem 0;
	}

	& ul, & ol {
		padding-left: 1.25rem;
		list-style: revert;
	}

	& code {
		border-radius: 4px;
		background: var(--color-oc-muted-bg);
		padding: 1px 5px;
		font-family: var(--font-mono);
		font-size: 0.875em;
	}

	& pre {
		overflow-x: auto;
		border-radius: var(--radius-oc);
		border: 1px solid var(--color-oc-border);
		background: var(--color-oc-card);
		padding: 12px 16px;
	}

	& pre code {
		background: transparent;
		padding: 0;
	}

	& blockquote {
		border-left: 3px solid var(--color-oc-border);
		padding-left: 12px;
		color: var(--color-oc-fg-muted);
	}

	& table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	& th, & td {
		border: 1px solid var(--color-oc-border);
		padding: 6px 8px;
		text-align: left;
	}

	& a {
		color: var(--color-oc-ring);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
`;

export function Markdown({ text }: { text: string }) {
	const html = useMemo(() => {
		if (!text) return "";
		const rendered = MARKDOWN.parse(text) as string;
		return DOMPurify.sanitize(rendered);
	}, [text]);

	return <div className={markdownStyle} dangerouslySetInnerHTML={{ __html: html }} />;
}
