import './Navbar.css';
import NavbarItem from './NavbarItem';

export default function Navbar() {
	return (
		<nav className="Navbar">
			<h2 className="Navbar-header">Main</h2>
			<ul className="Navbar-list">
				<NavbarItem icon="lucide:square-terminal" to="/">
					Dashboard
				</NavbarItem>
				<NavbarItem icon="lucide:video" to="/sermons">
					Sermons
				</NavbarItem>
				<NavbarItem icon="lucide:book" to="/series">
					Series
				</NavbarItem>
				<NavbarItem icon="lucide:megaphone" to="/speakers">
					Speakers
				</NavbarItem>
				<NavbarItem icon="lucide:stars" to="/ai-search">
					AI Search
				</NavbarItem>
				<NavbarItem icon="lucide:message-circle" to="/ai-chat">
					AI Chat
				</NavbarItem>
			</ul>

			<h2 className="Navbar-header">Content</h2>
			<ul className="Navbar-list">
				<NavbarItem icon="lucide:upload" to="/upload">
					Import / Upload
				</NavbarItem>
				<NavbarItem icon="lucide:tag" to="/tags">
					Tags &amp; Metadata
				</NavbarItem>
			</ul>

			<h2 className="Navbar-header">Admin</h2>
			<ul className="Navbar-list">
				<NavbarItem icon="lucide:user" to="/user-management">
					User Management
				</NavbarItem>
				<NavbarItem icon="lucide:bell" to="/notifications">
					Notifications
				</NavbarItem>
				<NavbarItem icon="lucide:settings" to="/settings">
					Settings
				</NavbarItem>
			</ul>
		</nav>
	);
}
