import { Icon } from '@iconify-icon/react';
import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import AddUserModal from '$/modals/AddUserModal';
import './UserManagement.css';
import { testUsers } from '$/data/users';
import {
	canRemove,
	dateRelative,
	getFullName,
	getInitials,
	getUser,
	userHue,
} from '$/types/user';

export default function UserManagement() {
	const [addUserOpen, setAddUserOpen] = useState(false);
	const currentUser = getUser();

	return (
		<MainLayout title="User Management">
			<header className="UserManagement-header">
				<p className="Header-info">
					Authentication is managed through Microsoft Entra SSO. All users must
					sign in with their organizational Microsoft account.
				</p>

				<button
					type="button"
					className="Header-addUser u-button"
					onClick={() => setAddUserOpen(true)}
				>
					<Icon icon="lucide:plus" />
					Add User
				</button>
			</header>

			<table className="UserManagement-users">
				<thead className="Users-thead">
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
						<tr key={user.id}>
							<td className="Users-name">
								<p
									className="Users-initials"
									style={{ '--h': userHue(user) } as React.CSSProperties}
								>
									{getInitials(user)}
								</p>
								<p className="Users-fullName">{getFullName(user)}</p>
							</td>
							<td className="Users-email">{user.email}</td>
							<td className="Users-role">
								<p className={`Users-roleChip is-${user.role.toLowerCase()}`}>
									{user.role}
								</p>
							</td>
							<td className="Users-lastActive">
								<time dateTime={user.lastActive.toISOString()}>
									{dateRelative(user)}
								</time>
							</td>
							<td className="Users-actions">
								<button type="button" className="Users-actionEdit u-button">
									Edit
								</button>
								<button
									type="button"
									className="Users-actionRemove u-button"
									hidden={!canRemove(currentUser, user)}
								>
									Remove
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>

			<AddUserModal
				isOpen={addUserOpen}
				onClose={() => setAddUserOpen(false)}
			/>
		</MainLayout>
	);
}
