import { dashboardImports } from '$/data/imports';
import ImportItem from './ImportItem';
import './ImportActivity.css';
import Container from './Container';

export default function ImportActivity() {
	return (
		<Container className="ImportActivity">
			<h3 className="ImportActivity-title">Import Activity</h3>

			<section className="ImportActivity-imports">
				{dashboardImports.map(job => (
					<ImportItem key={job.id} job={job} />
				))}
			</section>
		</Container>
	);
}
