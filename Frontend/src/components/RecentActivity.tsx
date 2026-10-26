import './RecentActivity.css';
import Container from './Container';

/**
 * Nothing records what happened across the app: the API has no event log and sermons do not keep who uploaded
 * them, and TFH-541 rules out building an event history. So this says it is unavailable, as the Searches Today
 * card does, instead of listing made-up entries.
 */
export default function RecentActivity() {
	return (
		<Container className="RecentActivity">
			<h3 className="RecentActivity-title">Recent Activity</h3>
			<p className="RecentActivity-status">
				Activity history not available yet
			</p>
		</Container>
	);
}
