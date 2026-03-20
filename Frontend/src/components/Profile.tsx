import { getFullName, getInitials, getUser } from '$/lib/user';
import './Profile.css';

export default function Profile() {
	const user = getUser();
	const initials = getInitials(user);
	const name = getFullName(user);

	return (
		<div className="Profile">
			<h2 className="Profile-name">{name}</h2>
			<p className="Profile-role">{user.role}</p>
			<p className="Profile-initials">{initials}</p>
			<button type="button" className="Profile-logOut u-button">
				Log Out
			</button>
		</div>
	);
}
