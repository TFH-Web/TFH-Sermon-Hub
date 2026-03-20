import Navbar from './Navbar';
import './Sidebar.css';

export default function Sidebar() {
	return (
		<aside className="Sidebar">
			<div className="Sidebar-logo">logo here</div>
			<Navbar />
			<div className="Sidebar-profile">profiel here</div>
		</aside>
	);
}
