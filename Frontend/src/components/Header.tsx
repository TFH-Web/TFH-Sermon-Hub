import type React from 'react';
import './Header.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';

export interface HeaderProps {
	className: string;
}

export default function Header({
	className,
	children,
}: React.PropsWithChildren<HeaderProps>) {
	return (
		<header className={clsx('Header', className)}>
			<h2 className="Header-title">{children}</h2>
			<input
				type="text"
				className="Header-search"
				placeholder="Search sermons, speakers, tags..."
			/>
			<button type="button" className="Header-upload u-button">
				<Icon icon="lucide:plus" />
				Upload
			</button>
		</header>
	);
}
