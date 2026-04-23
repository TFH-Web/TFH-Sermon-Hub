import type React from 'react';
import './Tag.css';
import clsx from 'clsx';
import type { Polymorphic } from '$/lib/polymorphic';

export type TagVariant = 'green' | 'outline' | 'red' | 'amber' | 'blue' | 'admin' | 'solid';

export interface TagProps {
	variant?: TagVariant;
	className?: string;
}

export default function Tag<Component extends React.ElementType = 'span'>({
	variant = 'green',
	children,
	className,
	as,
	...props
}: Polymorphic<Component, TagProps>) {
	const Component = as ?? 'span';
	return (
		<Component className={clsx('Tag', `Tag--${variant}`, className)} {...props}>
			{children}
		</Component>
	);
}
