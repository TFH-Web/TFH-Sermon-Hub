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
		<div className="RecentSermonsTable">
			<header className="RecentSermonsTable-header">
				<h2 className="RecentSermonsTable-title">Recent Sermons</h2>
				<a href="/sermons" className="RecentSermonsTable-viewAll">
					View All →
				</a>
			</header>

			<table className="RecentSermonsTable-table">
				<thead>
					<tr>
						<th className="RecentSermonsTable-colHeader RecentSermonsTable-colSermon">
							Sermon
						</th>
						<th className="RecentSermonsTable-colHeader RecentSermonsTable-colSpeaker">
							Speaker
						</th>
						<th className="RecentSermonsTable-colHeader RecentSermonsTable-colSeries">
							Series
						</th>
						<th className="RecentSermonsTable-colHeader RecentSermonsTable-colDate">
							Date
						</th>
						<th className="RecentSermonsTable-colHeader RecentSermonsTable-colStatus">
							Status
						</th>
					</tr>
				</thead>
				<tbody>
					{sermons.map(s => (
						<tr key={s.id} className="RecentSermonsTable-row">
							<td className="RecentSermonsTable-cell RecentSermonsTable-cell--title">
								{s.title}
							</td>
							<td className="RecentSermonsTable-cell">{s.speaker}</td>
							<td className="RecentSermonsTable-cell">{s.series}</td>
							<td className="RecentSermonsTable-cell">
								{formatDate(s.date, { month: 'short', day: 'numeric' })}
							</td>
							<td className="RecentSermonsTable-cell">
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
