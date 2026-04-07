import './RecentSermonsTable.css';
import Tag, { type TagProps } from './Tag';

export type Sermon = {
	id: string;
	title: string;
	speaker: string;
	series: string;
	date: string;
	status: 'Published' | 'Processing' | 'Failed';
};

const statusClass: Record<Sermon['status'], Pick<TagProps, 'variant'>> = {
	Published: { variant: 'green' },
	Processing: { variant: 'amber' },
	Failed: { variant: 'red' },
};

function RecentSermonsCard({ sermons }: { sermons: Sermon[] }) {
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
							<td className="RecentSermonsCard-cell">{s.date}</td>
							<td className="RecentSermonsCard-cell">
								<span>
									<Tag {...statusClass[s.status]}>
										{s.status}
									</Tag>	
									
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default RecentSermonsCard;
