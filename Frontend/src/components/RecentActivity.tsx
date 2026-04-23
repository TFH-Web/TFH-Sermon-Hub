import './RecentActivity.css';
import { activities } from '$/data/activity';
import Container from './Container';

export default function RecentActivity() {
	return (
		<Container className="RecentActivity">
			<h3 className="RecentActivity-title">Recent Activity</h3>
			<ul className="RecentActivity-list">
				{activities.map(item => {
					// Split text into bold part and the rest
					const rest = item.text.slice(item.boldPart.length);
					return (
						<li key={item.id} className="RecentActivity-item">
							<span
								className={`RecentActivity-dot RecentActivity-dot--${item.type}`}
							/>
							<p className="RecentActivity-text">
								<strong>{item.boldPart}</strong>
								{rest}
							</p>
							<time className="RecentActivity-time" dateTime={item.time}>
								{item.time}
							</time>
						</li>
					);
				})}
			</ul>
		</Container>
	);
}
