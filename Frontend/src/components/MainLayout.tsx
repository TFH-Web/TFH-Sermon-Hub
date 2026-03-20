import '@fontsource/dm-sans';
import './MainLayout.css';

import Sidebar from './Sidebar';

export default function MainLayout({
	children,
}: React.PropsWithChildren<unknown>) {
	return (
		<div className="Layout">
			<main className="Layout-main">{children}</main>
			<Sidebar />
		</div>
	);
}
