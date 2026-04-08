import { useState } from 'react';
import './Notifications.css';
import MainLayout from '$/components/MainLayout';
import { Card, CardHeader } from '$/components/Card';
import Button from '$/components/Button';
import { useToast } from '$/components/ToastContext';

const notifications = [
	{
		id: '1',
		status: 'success' as const,
		title: 'Upload Complete',
		description: '"Under Grace" successfully imported',
		recipient: 'samip@tfh.org',
		time: '2 hours ago',
	},
	{
		id: '2',
		status: 'error' as const,
		title: 'Import Failed',
		description: '"Bold Faith" transcription error',
		recipient: 'samip@tfh.org',
		time: '5 hours ago',
	},
	{
		id: '3',
		status: 'warning' as const,
		title: 'Bulk Import Update',
		description: '107/148 videos processed',
		recipient: 'all admins',
		time: '6 hours ago',
	},
];

export default function Notifications() {
	const { showToast } = useToast();

	const [completedUploads, setCompletedUploads] = useState(true);
	const [failedUploads, setFailedUploads] = useState(true);
	const [aiProcessing, setAiProcessing] = useState(true);
	const [versionChanges, setVersionChanges] = useState(false);
	const [newUsers, setNewUsers] = useState(true);

	return (
		<MainLayout title="Notifications">
			<div className="Notifications-header">
				<h2 className="Notifications-heading">Email Notifications</h2>
			</div>
			<p className="Notifications-subtitle">
				Admin notifications for upload completions, failures, and system
				events. Emails are sent only to admin accounts.
			</p>

			<div className="Notifications-grid">
				{/* Left column */}
				<div>
					<Card className="Notifications-settingsCard">
						<CardHeader title="Notification Settings" />
						<div className="Card-body">
							<div className="Notifications-checkboxGroup">
								<p className="Notifications-checkboxLabel">Notify on:</p>
								<label className="Notifications-checkbox">
									<input
										type="checkbox"
										checked={completedUploads}
										onChange={() =>
											setCompletedUploads(!completedUploads)
										}
									/>
									Completed uploads
								</label>
								<label className="Notifications-checkbox">
									<input
										type="checkbox"
										checked={failedUploads}
										onChange={() => setFailedUploads(!failedUploads)}
									/>
									Failed uploads / import attempts
								</label>
								<label className="Notifications-checkbox">
									<input
										type="checkbox"
										checked={aiProcessing}
										onChange={() => setAiProcessing(!aiProcessing)}
									/>
									AI processing complete
								</label>
								<label className="Notifications-checkbox">
									<input
										type="checkbox"
										checked={versionChanges}
										onChange={() =>
											setVersionChanges(!versionChanges)
										}
									/>
									Version changes / updates
								</label>
								<label className="Notifications-checkbox">
									<input
										type="checkbox"
										checked={newUsers}
										onChange={() => setNewUsers(!newUsers)}
									/>
									New user registrations
								</label>
							</div>
							<Button
								variant="primary"
								onClick={() =>
									showToast(
										'Notification settings saved',
										'success',
									)
								}
							>
								Save Settings
							</Button>
						</div>
					</Card>

					<Card>
						<CardHeader title="Recent Notifications Sent" />
						<div className="Card-body">
							{notifications.map(n => (
								<div key={n.id} className="Notifications-item">
									<span
										className={`Notifications-dot Notifications-dot--${n.status}`}
									/>
									<div>
										<p className="Notifications-text">
											<strong>{n.title}</strong> — {n.description}
										</p>
										<div className="Notifications-time">
											Sent to {n.recipient} &bull; {n.time}
										</div>
									</div>
								</div>
							))}
						</div>
					</Card>
				</div>

				{/* Right column */}
				<div>
					<Card>
						<CardHeader title="Email Preview" />
						<div className="Card-body">
							<p>Email preview coming soon...</p>
						</div>
					</Card>
				</div>
			</div>
		</MainLayout>
	);
}
