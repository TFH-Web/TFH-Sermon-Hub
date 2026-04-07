import { Icon } from '@iconify-icon/react';
import MainLayout from '$/components/MainLayout';
import './UserManagement.css';
import { testUsers } from './data/users';
import { canRemove, getFullName, getUser, userHue } from './types/user';

export default function UserManagement() {
	const currentUser = getUser();

	return (
		<MainLayout title="User Management">
			<header className="UserManagement-header">
				<p className="Header-info">
					Authentication is managed through Microsoft Entra SSO. All users must
					sign in with their organizational Microsoft account.
				</p>

				<button type="button" className="Header-addUser u-button">
					<Icon icon="lucide:plus" />
					Add User
				</button>
			</header>

			<table className="userManagement-Users">
				<thead>
					<tr>
						<th>User</th>
						<th>Email</th>
						<th>Role</th>
						<th>Last Active</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{testUsers.map(user => (
						<tr
							key={user.id}
							style={{ '--h': userHue(user) } as React.CSSProperties}
						>
							<td>{getFullName(user)}</td>
							<td>{user.email}</td>
							<td>{user.role}</td>
							<td>
								<time dateTime={user.lastActive.toISOString()}>
									{user.lastActive.toUTCString()}
								</time>
							</td>
							<td>
								<button type="button" className="u-button">Edit</button>
								<button type="button" className="u-button" hidden={!canRemove(currentUser, user)}>Remove</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</MainLayout>
	);
}
