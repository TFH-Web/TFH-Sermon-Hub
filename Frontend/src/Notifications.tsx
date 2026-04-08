import './Notifications.css';
import MainLayout from '$/components/MainLayout';
import { Card, CardHeader } from '$/components/Card';

export default function Notifications() {
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
							<p>Settings coming soon...</p>
						</div>
					</Card>

					<Card>
						<CardHeader title="Recent Notifications Sent" />
						<div className="Card-body">
							<p>Notifications coming soon...</p>
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
