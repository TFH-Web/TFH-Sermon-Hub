import Navbar from './Navbar';
import './Sidebar.css';
import { Link } from 'react-router';
import logo from '$/assets/logo.png';

export default function Sidebar() {
	return (
		<aside className="Sidebar">
			<div className="Sidebar-title">
				<Link className="Sidebar-titleLink" to="/">
					<div className="Sidebar-logoContainer">
						<img className="Sidebar-logo" src={logo} alt="TFH" />
					</div>
					<h1 className="Sidebar-header">Sermon Hub</h1>
				</Link>
			</div>
			<Navbar />
			<div className="Sidebar-profile">profiel here</div>
		</aside>
	);
}
