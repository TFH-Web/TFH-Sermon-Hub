import '@fontsource/dm-sans';
import '@fontsource/dm-sans/600';
import './MainLayout.css';

import Sidebar from './Sidebar';
import type React from 'react';
import Header from './Header';

export interface MainLayoutProps {
	title: string;
}

export default function MainLayout({
	title,
	children,
}: React.PropsWithChildren<MainLayoutProps>) {
	return (
		<div className="Layout">
			<Header className="Layout-header">{title}</Header>
			<main className="Layout-main">{children}</main>
			<Sidebar className="Layout-sidebar" />
		</div>
	);
}
