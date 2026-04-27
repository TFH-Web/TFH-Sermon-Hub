import type React from 'react';
import './Header.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidebar } from '$/lib/sidebar';
import UploadSermonModal from '$/modals/UploadSermonModal';

export interface HeaderProps {
	className: string;
}

export default function Header({
	className,
	children,
}: React.PropsWithChildren<HeaderProps>) {
	const { show, set } = useSidebar();
	const navigate = useNavigate();
	const [query, setQuery] = useState('');
	const [uploadOpen, setUploadOpen] = useState(false);

	function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const trimmed = query.trim();
		if (!trimmed) return;
		navigate(`/ai-search/results?q=${encodeURIComponent(trimmed)}`);
		setQuery('');
	}

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
				<form className="Header-search" onSubmit={handleSubmit}>
					<label className="Header-searchLabel">
						<Icon className="Header-searchIcon" icon="lucide:search" />
						<input
							type="text"
							className="Header-searchInput"
							placeholder="Search in AI Search"
							value={query}
							onChange={e => setQuery(e.target.value)}
						/>
					</label>
					<button type="submit" className="Header-searchConfirm">
						<Icon
							className="Header-searchConfirmIcon"
							icon="lucide:arrow-right"
						></Icon>
					</button>
				</form>

				<button
					type="button"
					className="Header-upload u-button"
					onClick={() => setUploadOpen(true)}
				>
					<Icon icon="lucide:plus" />
					<p className="Header-uploadText">Upload</p>
				</button>
			</div>

			<UploadSermonModal
				isOpen={uploadOpen}
				onClose={() => setUploadOpen(false)}
			/>
		</header>
	);
}
