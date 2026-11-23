import './Notifications.css';
import { Card, CardHeader } from '$/components/Card';
import MainLayout from '$/components/MainLayout';

// Email notifications are not built in this release, so this page says so plainly
// instead of showing a sample email that reads like one was really sent.
export default function Notifications() {
	return (
		<MainLayout title="Notifications">
			<div className="Notifications-header">
				<h2 className="Notifications-heading">Email Notifications</h2>
			</div>
			<p className="Notifications-subtitle">
				Admin email notifications for upload completions, failures, and system
				events are planned but not available yet.
			</p>

			<Card>
				<CardHeader title="Notification Status" />
				<div className="Card-body">
					<p className="Notifications-unavailableText">Unavailable</p>
					<p className="Notifications-unavailableLabel">
						Email notifications are not available in this release. No emails are
						sent.
					</p>
					<p className="Notifications-unavailableLabel">
						Check import results on the Import / Upload page.
					</p>
				</div>
			</Card>
		</MainLayout>
	);
}
