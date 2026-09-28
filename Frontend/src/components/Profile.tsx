import { getFullName, getInitials, useUser } from '$/types/user';
import './Profile.css';
import { useMsal } from '@azure/msal-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Profile() {
	const user = useUser();
	const initials = getInitials(user);
	const name = getFullName(user);
	const { instance } = useMsal();
	const queryClient = useQueryClient();

	function handleLogout() {
		queryClient.clear();
		instance.logoutRedirect();
	}

	return (
		<div className="Profile">
			<h2 className="Profile-name">{name}</h2>
			<p className="Profile-role">{user.role}</p>
			<p className="Profile-initials">{initials}</p>
			<button
				type="button"
				className="Profile-logOut u-button"
				onClick={handleLogout}
			>
				Log Out
			</button>
		</div>
	);
}
