import type React from 'react';
import './Tag.css';
import clsx from 'clsx';

export type TagProps<Component extends React.ElementType> =  {
	variant?: 'green' | 'outline' | 'red' | 'amber' | 'blue' | 'admin' | 'solid';
	className?: string;
	as?: Component;
} & React.ComponentPropsWithoutRef<Component>;

export default function Tag<Component extends React.ElementType = "span">({
	variant = 'green',
	children,
	className,
	as,
	...props
}: React.PropsWithChildren<TagProps<Component>>) {
	const Component = as ?? 'span';
	return (
		<Component className={clsx('Tag', `Tag--${variant}`, className)} {...props}>
			{children}
		</Component>
	);
}
