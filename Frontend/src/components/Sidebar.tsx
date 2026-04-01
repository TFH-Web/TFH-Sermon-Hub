import Navbar from './Navbar';
import './Sidebar.css';
import clsx from 'clsx';
import { Link } from 'react-router';
import logo from '$/assets/logo.png';
import Profile from './Profile';

export interface SidebarProps {
	className: string;
}

export default function Sidebar({ className }: SidebarProps) {
	return (
		<aside className={clsx('Sidebar', className)}>
			<div className="Sidebar-title">
				<Link className="Sidebar-titleLink" to="/">
					<div className="Sidebar-logoContainer">
						<img className="Sidebar-logo" src={logo} alt="TFH" />
					</div>
					<h1 className="Sidebar-header">Sermon Hub</h1>
				</Link>
			</div>
			<Navbar />
			<Profile />
		</aside>
	);
}
