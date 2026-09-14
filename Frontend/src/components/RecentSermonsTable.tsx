import './RecentSermonsTable.css';
import { formatDate } from '$/lib/date';
import { linkTo, type Sermon, statusVariant } from '$/types/sermon';
import { getFullName } from '$/types/speaker';
import Button from './Button';
import Container from './Container';
import Tag from './Tag';

const SKELETON_ROW_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'] as const;

export interface RecentSermonsTableProps {
	sermons: Sermon[];
	isLoading?: boolean;
	isError?: boolean;
	onRetry?: () => void;
}

export default function RecentSermonsTable({
	sermons,
	isLoading = false,
	isError = false,
	onRetry,
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
					{isError ? (
						<tr>
							<td colSpan={5}>
								<div className="RecentSermonsTable-status">
									<p className="RecentSermonsTable-statusText">
										Couldn't load recent sermons.
									</p>
									{onRetry && (
										<Button variant="secondary" size="sm" onClick={onRetry}>
											Retry
										</Button>
									)}
								</div>
							</td>
						</tr>
					) : isLoading ? (
						SKELETON_ROW_KEYS.map(key => (
							<tr key={key} className="RecentSermonsTable-skeletonRow">
								<th scope="row">
									<span className="RecentSermonsTable-skeletonBar" />
								</th>
								<td>
									<span className="RecentSermonsTable-skeletonBar" />
								</td>
								<td>
									<span className="RecentSermonsTable-skeletonBar" />
								</td>
								<td>
									<span className="RecentSermonsTable-skeletonBar RecentSermonsTable-skeletonBar--sm" />
								</td>
								<td>
									<span className="RecentSermonsTable-skeletonBar RecentSermonsTable-skeletonBar--sm" />
								</td>
							</tr>
						))
					) : (
						sermons.map(s => (
							<tr key={s.id}>
								<th scope="row">
									<a href={linkTo(s)}>{s.title}</a>
								</th>
								<td>
									<a href={linkTo(s)}>{getFullName(s.speaker)}</a>
								</td>
								<td>
									<a href={linkTo(s)}>{s.series?.title ?? '–'}</a>
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
						))
					)}
				</tbody>
			</table>
		</Container>
	);
}
