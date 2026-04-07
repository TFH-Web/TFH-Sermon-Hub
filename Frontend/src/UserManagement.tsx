import { Icon } from '@iconify-icon/react';
import MainLayout from '$/components/MainLayout';
import './UserManagement.css';

export default function UserManagement() {
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
		</MainLayout>
	);
}
