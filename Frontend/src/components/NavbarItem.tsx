import './NavbarItem.css';
import { Icon, type IconifyIcon } from '@iconify-icon/react';
import clsx from 'clsx';
import { NavLink, type To } from 'react-router';

export interface NavbarItemProps {
	icon: string | IconifyIcon;
	to: To;
}

export default function NavbarItem({
	icon,
	to,
	children,
}: React.PropsWithChildren<NavbarItemProps>) {
	return (
		<li>
			<NavLink
				className={({ isActive }) =>
					clsx('NavbarItem', 'u-button', isActive && 'is-active')
				}
				to={to}
			>
				<Icon className="NavbarItem-icon" icon={icon} size={32} />
				<div className="NavbarItem-name">{children}</div>
			</NavLink>
		</li>
	);
}
