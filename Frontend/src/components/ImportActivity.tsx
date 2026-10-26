import './ImportActivity.css';
import Container from './Container';

// TODO: list the recent YouTube bulk imports (syncs) here once TFH-535 is on dev. The server saves every sync
// (TFH-534, GET /api/import/youtube/runs, Admin only) and TFH-535 adds useSyncRuns, ActiveSyncItem and
// SyncRunItem to read and show them. Until then this says so instead of showing sample imports.
export default function ImportActivity() {
	return (
		<Container className="ImportActivity">
			<h3 className="ImportActivity-title">Import Activity</h3>
			<p className="ImportActivity-status">Import activity not available yet</p>
		</Container>
	);
}
