import type React from 'react';

interface As<Component extends React.ElementType> {
	as?: Component;
}

type PropsKeys<Component extends React.ElementType, Props> = keyof (Props &
	As<Component>);

export type Polymorphic<
	Component extends React.ElementType,
	Props = Record<string, never>,
> = React.PropsWithChildren<Props & As<Component>> &
	Omit<React.ComponentPropsWithoutRef<Component>, PropsKeys<Component, Props>>;
