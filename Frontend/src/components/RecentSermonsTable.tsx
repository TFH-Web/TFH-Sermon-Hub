import './RecentSermonsTable.css';
import { formatDate } from '$/lib/date';
import type { Sermon } from '$/types/sermon';
import Tag, { type TagProps } from './Tag';

const statusVariant: Record<Sermon['status'], TagProps['variant']> = {
	Published: 'green',
	Processing: 'amber',
	Failed: 'red',
};

export interface RecentSermonsTableProps {
	sermons: Sermon[];
}

export default function RecentSermonsTable({
	sermons,
}: RecentSermonsTableProps) {
	return (
		<div className="RecentSermonsCard">
			<div className="RecentSermonsCard-header">
				<span className="RecentSermonsCard-title">Recent Sermons</span>
				<a href="./sermons" className="RecentSermonsCard-viewAll">
					View All →
				</a>
			</div>

			<table className="RecentSermonsCard-table">
				<thead>
					<tr>
						<th className="RecentSermonsCard-colHeader RecentSermonsCard-colSermon">
							SERMON
						</th>
						<th className="RecentSermonsCard-colHeader RecentSermonsCard-colSpeaker">
							SPEAKER
						</th>
						<th className="RecentSermonsCard-colHeader RecentSermonsCard-colSeries">
							SERIES
						</th>
						<th className="RecentSermonsCard-colHeader RecentSermonsCard-colDate">
							DATE
						</th>
						<th className="RecentSermonsCard-colHeader RecentSermonsCard-colStatus">
							STATUS
						</th>
					</tr>
				</thead>
				<tbody>
					{sermons.map(s => (
						<tr key={s.id} className="RecentSermonsCard-row">
							<td className="RecentSermonsCard-cell RecentSermonsCard-cell--title">
								{s.title}
							</td>
							<td className="RecentSermonsCard-cell">{s.speaker}</td>
							<td className="RecentSermonsCard-cell">{s.series}</td>
							<td className="RecentSermonsCard-cell">
								{formatDate(s.date, { month: 'short', day: 'numeric' })}
							</td>
							<td className="RecentSermonsCard-cell">
								<span>
									<Tag variant={statusVariant[s.status]}>{s.status}</Tag>
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
