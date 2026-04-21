import type React from 'react';
import './Header.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import { useSidebar } from '$/lib/sidebar';

export interface HeaderProps {
	className: string;
}

export default function Header({
	className,
	children,
}: React.PropsWithChildren<HeaderProps>) {
	const {show, set} = useSidebar();

	return (
		<header className={clsx('Header', className)}>
			<label className="Header-sidebarToggle">
				<Icon className="SidebarToggle-icon" icon="lucide:menu" />
				<input
					className="SidebarToggle-show"
					id="sidebar-toggle"
					type="checkbox"
					checked={show}
					hidden={true}
					onChange={e => set(e.target.checked)}
				/>
			</label>
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
