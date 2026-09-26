import { getFullName, getInitials, getUser } from '$/types/user';
import './Profile.css';
import { useMsal } from '@azure/msal-react';

export default function Profile() {
	const user = getUser();
	const initials = getInitials(user);
	const name = getFullName(user);
	const { instance } = useMsal();

	return (
		<div className="Profile">
			<h2 className="Profile-name">{name}</h2>
			<p className="Profile-role">{user.role}</p>
			<p className="Profile-initials">{initials}</p>
			<button
				type="button"
				className="Profile-logOut u-button"
				onClick={() => instance.logoutRedirect()}
			>
				Log Out
			</button>
		</div>
	);
}
