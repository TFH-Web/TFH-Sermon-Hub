import { dashboardImports } from '$/data/imports';
import ImportItem from './ImportItem';
import './ImportActivity.css';
import Container from './Container';

export default function ImportActivity() {
	return (
		<Container className="ImportActivity">
			<h2 className="ImportActivity-title">Import Activity</h2>

			{dashboardImports.map(job => (
				<ImportItem key={job.id} job={job} />
			))}
		</Container>
	);
}
