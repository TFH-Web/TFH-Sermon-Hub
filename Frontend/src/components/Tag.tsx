import type React from 'react';
import './Tag.css';
import clsx from 'clsx';

export interface TagProps {
	variant?: 'green' | 'outline' | 'red' | 'amber' | 'blue' | 'admin';
	className?: string;
}

export default function Tag({
	variant = 'green',
	children,
	className,
}: React.PropsWithChildren<TagProps>) {
	return (
		<span className={clsx('Tag', `Tag--${variant}`, className)}>
			{children}
		</span>
	);
}
