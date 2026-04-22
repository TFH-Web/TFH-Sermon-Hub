import './RecentActivity.css';
import { activities } from '$/data/activity';

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
