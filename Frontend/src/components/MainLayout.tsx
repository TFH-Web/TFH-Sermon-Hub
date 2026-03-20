import '@fontsource/dm-sans';
import './MainLayout.css';

import Sidebar from './Sidebar';

export default function MainLayout({
	children,
}: React.PropsWithChildren<unknown>) {
	return (
		<div className="Layout">
			<Sidebar />
			<main>{children}</main>
		</div>
	);
}
