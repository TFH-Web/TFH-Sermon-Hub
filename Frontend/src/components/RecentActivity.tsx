import './RecentActivity.css';

// Dot color indicates the type of activity
type ActivityType = 'success' | 'system' | 'error' | 'info';

interface ActivityItem {
	id: string;
	type: ActivityType;
	text: string; // full activity line e.g. "Someone uploaded "Under Grace""
	boldPart: string; // the part to bold e.g. "Someone"
	time: string;
}

const activities: ActivityItem[] = [
	{
		id: '1',
		type: 'success',
		boldPart: 'Someone',
		text: 'Someone uploaded "Under Grace"',
		time: '2 hours ago',
	},
	{
		id: '2',
		type: 'success',
		boldPart: 'AI Engine',
		text: 'AI Engine generated transcript for "Walking in Freedom"',
		time: '3 hours ago',
	},
	{
		id: '3',
		type: 'system',
		boldPart: 'System',
		text: 'System — Bulk import 72% complete',
		time: '4 hours ago',
	},
	{
		id: '4',
		type: 'error',
		boldPart: 'Import Error',
		text: 'Import Error — "Bold Faith" transcription failed',
		time: '5 hours ago',
	},
	{
		id: '5',
		type: 'info',
		boldPart: 'Email sent',
		text: 'Email sent — Upload complete notification to admin',
		time: 'Yesterday',
	},
];

export default function RecentActivity() {
	return (
		<div className="RecentActivity">
			<h2 className="RecentActivity-title">Recent Activity</h2>
			<ul className="RecentActivity-list">
				{activities.map(item => {
					// Split text into bold part and the rest
					const rest = item.text.slice(item.boldPart.length);
					return (
						<li key={item.id} className="RecentActivity-item">
							<span
								className={`RecentActivity-dot RecentActivity-dot--${item.type}`}
							/>
							<div className="RecentActivity-body">
								<p className="RecentActivity-text">
									<strong>{item.boldPart}</strong>
									{rest}
								</p>
								<span className="RecentActivity-time">{item.time}</span>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
