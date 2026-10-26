import { useState } from 'react';
import './Notifications.css';
import { Card, CardHeader } from '$/components/Card';
import MainLayout from '$/components/MainLayout';

type Notification = {
	id: number;
	status: string;
	title: string;
	description: string;
	recipient: string;
	time: number;
};

export default function Notifications() {
	//TO DO: query the notifications directed towards the user
	const [notifications, _setNotifications] = useState<Notification[]>([]);

	return (
		<MainLayout title="Notifications">
			<div className="Notifications-header">
				<h2 className="Notifications-heading">Email Notifications</h2>
			</div>
			<p className="Notifications-subtitle">
				Admin notifications for upload completions, failures, and system events.
				Emails are sent only to admin accounts.
			</p>

			<div className="Notifications-grid">
				{/* Left column */}
				<div>
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
											TFH Sermon Hub &lt;noreply@sermonhub.tfh.org&gt;
										</strong>
									</p>
									<p>
										To: <strong>samip@tfh.org</strong>
									</p>
									<p>
										Subject:{' '}
										<strong>Upload Complete — &ldquo;Under Grace&rdquo;</strong>
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
										The following content has been successfully imported and
										processed:
									</p>
									<br />
									<p>
										<strong>Sermon:</strong> Under Grace
										<br />
										<strong>Speaker:</strong> Dave Patterson
										<br />
										<strong>Series:</strong> Live Your Best Life (#4 of 6)
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
										Tags generated (5 tags: grace, faith, transformation,
										purpose, relationships)
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
