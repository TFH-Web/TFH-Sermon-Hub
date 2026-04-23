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
	const { show, set } = useSidebar();

	return (
		<header className={clsx('Header', className)}>
			<label
				className="Header-sidebarToggle"
				data-testid="sidebar-toggle-label"
			>
				<p className="SidebarToggle-text">Toggle sidebar</p>
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

			<div className="Header-controls">
				<form className="Header-search" action="/ai-search" method="get">
					<label className="Header-searchLabel">
						<Icon className="Header-searchIcon" icon="lucide:search" />
						<input
							name="query"
							type="text"
							className="Header-searchInput"
							placeholder="Search sermons, speakers, tags..."
						/>
					</label>
					<button type="submit" className="Header-searchConfirm">
						<Icon
							className="Header-searchConfirmIcon"
							icon="lucide:arrow-right"
						></Icon>
					</button>
				</form>

				<button type="button" className="Header-upload u-button">
					<Icon icon="lucide:plus" />
					<p className="Header-uploadText">Upload</p>
				</button>
			</div>
		</header>
	);
}
