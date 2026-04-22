import { dashboardImports } from '$/data/imports';
import ImportItem from './ImportItem';
import './ImportActivity.css';

export default function ImportActivity() {
	return (
		<div className="ImportActivity">
			<h2 className="ImportActivity-title">Import Activity</h2>

			{dashboardImports.map(job => (
				<ImportItem key={job.id} job={job} />
			))}
		</div>
	);
}
