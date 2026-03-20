import type React from 'react';
import './Button.css';
import clsx from 'clsx';

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
	size?: 'default' | 'sm';
}

export default function Button({
	variant = 'primary',
	size = 'default',
	className,
	children,
	...rest
}: ButtonProps) {
	return (
		<button
			className={clsx(
				'Button',
				`Button--${variant}`,
				size === 'sm' && 'Button--sm',
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
