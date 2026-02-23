import { css, cx } from "@linaria/core";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

const base = css`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	white-space: nowrap;
	font-weight: 500;
	transition: color 150ms, background-color 150ms, border-color 150ms;
	&:disabled {
		pointer-events: none;
		opacity: 0.5;
	}
	& svg {
		pointer-events: none;
		flex-shrink: 0;
	}
`;

const variantStyles = {
	default: css`
		background-color: var(--color-oc-primary);
		color: var(--color-oc-primary-fg);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		&:hover {
			opacity: 0.9;
		}
	`,
	destructive: css`
		background-color: var(--color-oc-error);
		color: white;
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		&:hover {
			opacity: 0.9;
		}
	`,
	outline: css`
		border: 1px solid var(--color-oc-border);
		background-color: var(--color-oc-card);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		&:hover {
			background-color: var(--color-oc-muted-bg);
		}
	`,
	secondary: css`
		background-color: var(--color-oc-muted-bg);
		color: var(--color-oc-fg);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		&:hover {
			opacity: 0.8;
		}
	`,
	ghost: css`
		&:hover {
			background-color: var(--color-oc-muted-bg);
		}
	`,
	link: css`
		color: var(--color-oc-primary);
		text-underline-offset: 4px;
		&:hover {
			text-decoration: underline;
		}
	`,
};

const sizeStyles = {
	default: css`
		height: 36px;
		padding: 8px 16px;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	`,
	sm: css`
		height: 32px;
		padding: 0 12px;
		border-radius: 0.375rem;
		font-size: 0.75rem;
	`,
	lg: css`
		height: 40px;
		padding: 0 24px;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	`,
	icon: css`
		width: 36px;
		height: 36px;
		border-radius: 0.375rem;
	`,
};

type Variant = keyof typeof variantStyles;
type Size = keyof typeof sizeStyles;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
	asChild?: boolean;
}

export function Button({ className, variant = "default", size = "default", asChild = false, ...props }: ButtonProps) {
	const Comp = asChild ? Slot : "button";
	return <Comp className={cx(base, variantStyles[variant], sizeStyles[size], className)} {...props} />;
}
