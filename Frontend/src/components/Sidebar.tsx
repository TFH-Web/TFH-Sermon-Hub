import Navbar from './Navbar';
import './Sidebar.css';
import clsx from 'clsx';
import { Link } from 'react-router';
import logo from '$/assets/logo.png';
import Profile from './Profile';
import { Icon } from '@iconify-icon/react';

export interface SidebarProps {
	className: string;
}

export default function Sidebar({ className }: SidebarProps) {
	return (
		<>
		<label htmlFor="sidebar-toggle" className="Sidebar-backdrop"></label>
		<aside className={clsx('Sidebar', className)}>
			<div className="Sidebar-title">
				<Link className="Sidebar-titleLink" to="/">
					<div className="Sidebar-logoContainer">
						<img className="Sidebar-logo" src={logo} alt="TFH" />
					</div>
					<h1 className="Sidebar-header">Sermon Hub</h1>
				</Link>

				<label htmlFor="sidebar-toggle" className="Sidebar-close">
					<Icon className="Sidebar-closeIcon" icon="lucide:x" />
				</label>
			</div>
			<Navbar />
			<Profile />
		</aside>
		</>
	);
}
