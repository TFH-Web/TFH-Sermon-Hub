import type React from 'react';
import './ImportItem.css';
import clsx from 'clsx';

export interface ImportItemProps {
	icon: React.ReactNode;
	title: string;
	subtitle: string;
	action?: React.ReactNode;
	className?: string;
}

export default function ImportItem({
	icon,
	title,
	subtitle,
	action,
	className,
}: ImportItemProps) {
	return (
		<div className={clsx('ImportItem', className)}>
			<div className="ImportItem-icon">{icon}</div>
			<div className="ImportItem-info">
				<div className="ImportItem-title">{title}</div>
				<div className="ImportItem-subtitle">{subtitle}</div>
			</div>
			{action && <div className="ImportItem-action">{action}</div>}
		</div>
	);
}
