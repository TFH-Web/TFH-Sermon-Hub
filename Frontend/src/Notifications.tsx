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
	{
		id: '4',
		status: 'success' as const,
		title: 'AI Processing Complete',
		description: 'Transcript generated for "Walking in Freedom"',
		recipient: 'samip@tfh.org',
		time: '8 hours ago',
	},
	{
		id: '5',
		status: 'success' as const,
		title: 'Upload Complete',
		description: '"Power of Community" successfully imported',
		recipient: 'samip@tfh.org',
		time: 'Yesterday',
	},
	{
		id: '6',
		status: 'error' as const,
		title: 'Transcription Failed',
		description: '"Sunday Worship 2019" audio quality too low',
		recipient: 'all admins',
		time: 'Yesterday',
	},
	{
		id: '7',
		status: 'success' as const,
		title: 'New User Registered',
		description: 'Nicole Espinoza joined via Microsoft Entra SSO',
		recipient: 'samip@tfh.org',
		time: '2 days ago',
	},
	{
		id: '8',
		status: 'warning' as const,
		title: 'Storage Warning',
		description: 'Storage usage at 80% capacity',
		recipient: 'all admins',
		time: '3 days ago',
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
							<div className="Notifications-feed">
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
						</div>
					</Card>
				</div>

				{/* Right column */}
				<div>
					<Card>
						<CardHeader title="Email Preview" />
						<div className="Card-body">
							<div className="Notifications-emailPreview">
								<div className="Notifications-emailHeader">
									<p>
										From:{' '}
										<strong>
											TFH Sermon Hub
											&lt;noreply@sermonhub.tfh.org&gt;
										</strong>
									</p>
									<p>
										To: <strong>samip@tfh.org</strong>
									</p>
									<p>
										Subject:{' '}
										<strong>
											Upload Complete — &ldquo;Under Grace&rdquo;
										</strong>
									</p>
								</div>
								<div className="Notifications-emailBody">
									<p>
										<strong>Sermon Hub — Upload Report</strong>
									</p>
									<br />
									<p>Hi Samip,</p>
									<br />
									<p>
										The following content has been successfully
										imported and processed:
									</p>
									<br />
									<p>
										<strong>Sermon:</strong> Under Grace
										<br />
										<strong>Speaker:</strong> Dave Patterson
										<br />
										<strong>Series:</strong> Live Your Best Life (#4
										of 6)
										<br />
										<strong>Date:</strong> February 23, 2026
									</p>
									<br />
									<p>
										<strong>AI Processing:</strong>
										<br />
										Transcript generated (4,218 words)
										<br />
										Summary generated
										<br />
										Tags generated (5 tags: grace, faith,
										transformation, purpose, relationships)
									</p>
									<br />
									<p>— TFH Sermon Hub</p>
								</div>
							</div>
						</div>
					</Card>
				</div>
			</div>
		</MainLayout>
	);
}
