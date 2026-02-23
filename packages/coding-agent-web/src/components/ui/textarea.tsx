import { css, cx } from "@linaria/core";
import type { ComponentProps } from "react";

const textareaBase = css`
	display: flex;
	min-height: 80px;
	width: 100%;
	border-radius: 0.375rem;
	border: 1px solid var(--color-oc-border);
	background-color: transparent;
	padding: 8px 12px;
	font-size: 1rem;
	box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
	outline: none;
	&::placeholder {
		color: var(--color-oc-fg-muted);
	}
	&:focus-visible {
		box-shadow: 0 0 0 1px var(--color-oc-ring);
	}
	&:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	@media (min-width: 768px) {
		font-size: 0.875rem;
	}
`;

export type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, ...props }: TextareaProps) {
	return <textarea className={cx(textareaBase, className)} {...props} />;
}
