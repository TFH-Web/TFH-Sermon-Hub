import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import MurmurHash3 from 'imurmurhash';
import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import NewSeriesModal from '$/modals/NewSeriesModal';
import { type SeriesCard, SeriesPage } from '$/types/series';
import './Series.css';

const PER_PAGE = 12;

export default function Seriess() {
	const [newSeriesOpen, setNewSeriesOpen] = useState(false);
	const [page, setPage] = useState(1);

	const seriesQuery = useQuery({
		queryKey: ['series', page],
		queryFn: async () => {
			const res = await axios.get(
				`/api/series?page=${page}&per_page=${PER_PAGE}`,
			);
			return await SeriesPage.parseAsync(res.data);
		},
	});

	if (seriesQuery.isError) {
		return (
			<MainLayout title="Series" className="Series">
				<div className="series-error">
					<h1>Error loading series</h1>
					<p>{seriesQuery.error.message}</p>
					<button type="button" onClick={() => seriesQuery.refetch()}>
						Retry
					</button>
				</div>
			</MainLayout>
		);
	}

	if (seriesQuery.isPending) {
		return (
			<MainLayout title="Series" className="Series">
				<h1>Loading...</h1>
			</MainLayout>
		);
	}

	const { items, total } = seriesQuery.data;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

	return (
		<MainLayout title="Series">
			<div className="series-header">
				<p className="series-section-title">Sermon Series</p>
				<button
					type="button"
					className="series-new-button"
					onClick={() => setNewSeriesOpen(true)}
				>
					+ New Series
				</button>
			</div>

			<div className="series-grid">
				{items.map((series: SeriesCard) => {
					const hue = seriesHue(series.id, series.title ?? '');
					const bannerGradient = `linear-gradient(135deg, hsl(${hue}, 40%, 30%) 0%, hsl(${hue}, 40%, 60%) 100%)`;

					return (
						<div key={series.id} className="series-card">
							<div
								className="series-card-banner"
								style={{ background: bannerGradient }}
							>
								<span className="series-banner-title">{series.title}</span>
							</div>
							<div className="series-info">
								<div className="series-name">{series.title}</div>
								<div className="series-meta-data">
									{series.sermonCount !== 1
										? `${series.sermonCount} Sermons`
										: '1 Sermon'}
									{` * Series ID ${series.id}`}

									{/* Date handling: firstDate/lastDate are YYYY-MM-DD strings or null */}
									{formatDateRange(series.firstDate, series.lastDate)}

									{/* Speaker handling */}
									{formatSpeakers(series.speakers)}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Pagination controls */}
			<div
				className="series-pagination"
				style={{
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					gap: '1rem',
					marginTop: '2rem',
				}}
			>
				<button
					type="button"
					disabled={page <= 1}
					onClick={() => setPage(p => Math.max(1, p - 1))}
				>
					Previous
				</button>
				<span>
					Page {page} of {totalPages}
				</span>
				<button
					type="button"
					disabled={page >= totalPages}
					onClick={() => setPage(p => Math.min(totalPages, p + 1))}
				>
					Next
				</button>
			</div>

			<NewSeriesModal
				isOpen={newSeriesOpen}
				onClose={() => setNewSeriesOpen(false)}
			/>
		</MainLayout>
	);
}

// Format year range from YYYY-MM-DD date strings
function formatDateRange(
	firstDate: string | null,
	lastDate: string | null,
): string {
	if (!firstDate || !lastDate) return '';
	const startYear = firstDate.slice(0, 4);
	const endYear = lastDate.slice(0, 4);
	return startYear === endYear
		? ` * Date ${startYear}`
		: ` * Date ${startYear}-${endYear}`;
}

// Format speaker list
function formatSpeakers(
	speakers: Array<{ firstName: string; lastName: string }>,
): string {
	if (speakers.length === 0) return ' * 0 Speakers';
	if (speakers.length === 1) return ` * ${speakers[0].lastName}`;
	return ' * Multiple speakers';
}

export function seriesHue(sId: number, sTitle: string): number {
	const digest = sId + sTitle;
	return MurmurHash3(digest).result() % 360;
}
