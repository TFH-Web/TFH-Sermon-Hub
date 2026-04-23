import type React from 'react';
import './Container.css';
import clsx from 'clsx';
import type { Polymorphic } from '$/lib/polymorphic';

export interface ContainerProps {
	className: string;
};

export default function Container<Component extends React.ElementType = 'div'>({
	className,
	children,
	as,
	...props
}: Polymorphic<Component, ContainerProps>) {
	const Component = as ?? 'div';
	return (
		<Component className={clsx('Container', className)} {...props}>
			{children}
		</Component>
	);
}
