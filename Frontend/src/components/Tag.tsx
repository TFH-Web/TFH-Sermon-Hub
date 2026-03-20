import type React from 'react';
import './Tag.css';
import clsx from 'clsx';

export interface TagProps {
	variant?: 'green' | 'outline' | 'red' | 'amber' | 'blue' | 'admin';
	children: React.ReactNode;
	className?: string;
}

export default function Tag({
	variant = 'green',
	children,
	className,
}: TagProps) {
	return (
		<span className={clsx('Tag', `Tag--${variant}`, className)}>
			{children}
		</span>
	);
}
