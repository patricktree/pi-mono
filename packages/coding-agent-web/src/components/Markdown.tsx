import { useMemo } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";

const MARKDOWN = new Marked({ async: false, gfm: true, breaks: false });

export function Markdown({ text }: { text: string }) {
	const html = useMemo(() => {
		if (!text) return "";
		const rendered = MARKDOWN.parse(text) as string;
		return DOMPurify.sanitize(rendered);
	}, [text]);

	return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
