import type React from 'react';
import { useCallback, useEffect } from 'react';
import './Modal.css';
import clsx from 'clsx';

export interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title?: string;
	size?: 'sm' | 'default' | 'lg';
	footer?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}

export default function Modal({
	isOpen,
	onClose,
	title,
	size = 'default',
	footer,
	children,
	className,
}: ModalProps) {
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		},
		[onClose],
	);

	useEffect(() => {
		if (isOpen) {
			document.addEventListener('keydown', handleKeyDown);
			return () => document.removeEventListener('keydown', handleKeyDown);
		}
	}, [isOpen, handleKeyDown]);

	if (!isOpen) return null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: overlay click-to-close is intentional
		<div
			className="Modal-overlay"
			onClick={onClose}
			onKeyDown={undefined}
			role="presentation"
		>
			<div
				className={clsx('Modal-panel', `Modal-panel--${size}`, className)}
				onClick={e => e.stopPropagation()}
				onKeyDown={undefined}
				role="dialog"
				aria-modal="true"
			>
				{title && (
					<div className="Modal-header">
						<h2 className="Modal-title">{title}</h2>
						<button
							type="button"
							className="Modal-close"
							onClick={onClose}
							aria-label="Close"
						>
							&times;
						</button>
					</div>
				)}
				<div className="Modal-body">{children}</div>
				{footer && <div className="Modal-footer">{footer}</div>}
			</div>
		</div>
	);
}
