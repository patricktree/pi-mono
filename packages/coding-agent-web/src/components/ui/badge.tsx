import { css, cx } from "@linaria/core";
import type { HTMLAttributes } from "react";

const base = css`
	display: inline-flex;
	align-items: center;
	border-radius: 0.375rem;
	border: 1px solid transparent;
	padding: 2px 10px;
	font-size: 0.75rem;
	font-weight: 600;
	transition: color 150ms, background-color 150ms, border-color 150ms;
`;

const variantStyles = {
	default: css`
		background-color: var(--color-oc-primary);
		color: var(--color-oc-primary-fg);
	`,
	secondary: css`
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
	`,
	destructive: css`
		background-color: var(--color-oc-error);
		color: white;
	`,
	outline: css`
		border-color: var(--color-oc-border);
		color: var(--color-oc-fg);
	`,
};

type Variant = keyof typeof variantStyles;

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
	variant?: Variant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
	return <div className={cx(base, variantStyles[variant], className)} {...props} />;
}
