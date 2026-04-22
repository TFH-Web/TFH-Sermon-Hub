import '@fontsource/dm-sans';
import '@fontsource/dm-sans/600';
import './MainLayout.css';

import type React from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useSidebar } from '$/lib/sidebar';
import Header from './Header';
import Sidebar from './Sidebar';

export interface MainLayoutProps {
	title: string;
}

export default function MainLayout({
	title,
	children,
}: React.PropsWithChildren<MainLayoutProps>) {
	const onNavigate = useSidebar(state => state.onNavigate);
	const location = useLocation();

	useEffect(() => {
		onNavigate(location.pathname);
	}, [onNavigate, location]);

	return (
		<div className="Layout">
			<Header className="Layout-header">{title}</Header>
			<main className="Layout-main">
				<h2 className="Layout-title">{title}</h2>
				{children}
			</main>
			<Sidebar className="Layout-sidebar" />
		</div>
	);
}
