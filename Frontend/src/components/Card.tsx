import type React from 'react';
import './Card.css';
import clsx from 'clsx';

export interface CardProps {
	className?: string;
	children: React.ReactNode;
}

export interface CardHeaderProps {
	title: string;
	action?: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
	return <div className={clsx('Card', className)}>{children}</div>;
}

export function CardHeader({ title, action }: CardHeaderProps) {
	return (
		<div className="Card-header">
			<h3 className="Card-header-title">{title}</h3>
			{action && <div className="Card-header-action">{action}</div>}
		</div>
	);
}
