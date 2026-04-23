import './RecentSermonsTable.css';
import { formatDate } from '$/lib/date';
import { linkTo, statusVariant, type Sermon } from '$/types/sermon';
import Container from './Container';
import Tag from './Tag';

export interface RecentSermonsTableProps {
	sermons: Sermon[];
}

export default function RecentSermonsTable({
	sermons,
}: RecentSermonsTableProps) {
	return (
		<Container className="RecentSermonsTable">
			<header className="RecentSermonsTable-header">
				<h3 className="RecentSermonsTable-title">Recent Sermons</h3>
				<a href="/sermons" className="RecentSermonsTable-viewAll">
					View All →
				</a>
			</header>

			<table className="RecentSermonsTable-table">
				<thead>
					<tr>
						<th scope="column" className="RecentSermonsTable-colSermon">
							Sermon
						</th>
						<th scope="column" className="RecentSermonsTable-colSpeaker">
							Speaker
						</th>
						<th scope="column" className="RecentSermonsTable-colSeries">
							Series
						</th>
						<th scope="column" className="RecentSermonsTable-colDate">
							Date
						</th>
						<th scope="column" className="RecentSermonsTable-colStatus">
							Status
						</th>
					</tr>
				</thead>
				<tbody>
					{sermons.map(s => (
						<tr key={s.id}>
							<th scope="row">
								<a href={linkTo(s)}>{s.title}</a>
							</th>
							<td>
								<a href={linkTo(s)}>{s.speaker}</a>
							</td>
							<td>
								<a href={linkTo(s)}>{s.series}</a>
							</td>
							<td>
								<a href={linkTo(s)}>
									{formatDate(s.date, { month: 'short', day: 'numeric' })}
								</a>
							</td>
							<td>
								<a href={linkTo(s)}>
									<Tag variant={statusVariant(s.status)}>{s.status}</Tag>
								</a>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</Container>
	);
}
