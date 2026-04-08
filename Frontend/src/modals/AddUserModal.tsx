import { type ChangeEvent, useState } from 'react';
import Button from '$/components/Button';
import { FormField } from '$/components/FormField';
import Modal from '$/components/Modal';
import { useToast } from '$/components/ToastContext';
import './AddUserModal.css';

interface AddUserModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function AddUserModal({ isOpen, onClose }: AddUserModalProps) {
	const { showToast } = useToast();

	const [email, setEmail] = useState('');
	const [displayName, setDisplayName] = useState('');
	const [role, setRole] = useState('');
	const [privacyLevel, setPrivacyLevel] = useState('');

	const handleCreateUser = () => {
		if (!email.trim() || !displayName.trim() || !role || !privacyLevel) {
			showToast('Please fill in all required fields', 'error');
			return;
		}

		onClose();
		showToast('User added', 'success');

		setEmail('');
		setDisplayName('');
		setRole('');
		setPrivacyLevel('');
	};

	const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
		setEmail(event.target.value);
	};

	const handleDisplayNameChange = (event: ChangeEvent<HTMLInputElement>) => {
		setDisplayName(event.target.value);
	};

	const handleRoleChange = (event: ChangeEvent<HTMLSelectElement>) => {
		setRole(event.target.value);
	};

	const handlePrivacyLevelChange = (event: ChangeEvent<HTMLSelectElement>) => {
		setPrivacyLevel(event.target.value);
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Add User"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" onClick={handleCreateUser}>
						Add User
					</Button>
				</>
			}
		>
			<div>
				<div className="AddUserModal-infoBox">
					Users must have a Microsoft Entra account in your organization to
					access Sermon Hub.
				</div>
				<FormField label="Email (Microsoft Entra)">
					<input
						type="email"
						placeholder="e.g. user@example.com"
						name="email"
						value={email}
						onChange={handleEmailChange}
					/>
				</FormField>

				<FormField label="Display Name">
					<input
						type="text"
						placeholder="Full name"
						name="displayName"
						value={displayName}
						onChange={handleDisplayNameChange}
					/>
				</FormField>

				<FormField label="Role">
					<select value={role} onChange={handleRoleChange}>
						<option value="">Select role</option>
						<option value="internal-user">Internal User</option>
						<option value="admin">Admin</option>
					</select>
				</FormField>

				<FormField label="Privacy Level">
					<select value={privacyLevel} onChange={handlePrivacyLevelChange}>
						<option value="">Select privacy level</option>
						<option value="level-2">Standard (Level 2)</option>
						<option value="level-3">Full Access (Level 3)</option>
						<option value="level-1">Read Only (Level 1)</option>
					</select>
				</FormField>
			</div>
		</Modal>
	);
}
