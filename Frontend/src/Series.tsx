import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import MurmurHash3 from 'imurmurhash';
import { useState } from 'react';
import ErrorBox from '$/components/ErrorBox';
import Loading from '$/components/Loading';
import MainLayout from '$/components/MainLayout';
import NewSeriesModal from '$/modals/NewSeriesModal';
import { type SeriesCard, SeriesPage } from '$/types/series';
import { Sermon } from '$/types/sermon';
import './Series.css';
import Pagination from '$/components/Pagination';

// How many series cards to display per page
const PER_PAGE = 12;

export default function Seriess() {
	const [newSeriesOpen, setNewSeriesOpen] = useState(false); // Remembers if the "+ New Series" modal popup is open
	const [page, setPage] = useState(1); // Tracks which page number the user is currently viewing

	// Ask the backend for the slice of series cards for the current page
	const seriesQuery = useQuery({
		// Cache key includes 'page' so each page's data is cached separately and doesn't overwrite other pages
		queryKey: ['series', page],
		queryFn: async () => {
			// Request only the 12 series belonging to this page
			const res = await axios.get(
				`/api/series?page=${page}&per_page=${PER_PAGE}`,
			);
			// Validate response shape against SeriesPage schema (items, total, page, perPage)
			return SeriesPage.parseAsync(res.data);
		},
		retry: 2,
	});

	//querying for sermon data (id, title, videoLink, duration, date, description, tags, transcript, summary, speaker, series, status)
	const sermonQuery = useQuery({
		queryKey: ['sermons'],
		queryFn: async () => {
			const res = await axios.get('/api/sermons');
			return Sermon.array().parseAsync(res.data);
		},
		retry: 2,
	});

	// If the backend request failed or network broke, show an error box with a retry button instead of a blank screen
	if (seriesQuery.isError || sermonQuery.isError) {
		return (
			<MainLayout title="Series" className="Series">
				<ErrorBox
					message="Failed to load series."
					onRetry={() => {
						if (seriesQuery.isError) seriesQuery.refetch();
						if (sermonQuery.isError) sermonQuery.refetch();
					}}
				/>
			</MainLayout>
		);
	}

	// While waiting for the backend to respond, show a loading placeholder
	if (seriesQuery.isPending || sermonQuery.isPending) {
		return (
			<MainLayout title="Series" className="Series">
				<Loading vertical />
			</MainLayout>
		);
	}

	// Successfully received data from the backend
	const { items, total } = seriesQuery.data;
	// Calculate the maximum number of pages based on total series and per-page limit (minimum 1 page)
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

	return (
		<MainLayout title="Series">
			{/* Page Header with title and + New Series button */}
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

			{/* Grid displaying the series cards for the current page */}
			<div className="series-grid">
				{items.map((series: SeriesCard) => {
					// Pick a distinct color hue for the banner using the series id and title
					const hue = seriesHue(series.id, series.title ?? '');
					const bannerGradient = `linear-gradient(135deg, hsl(${hue}, 40%, 30%) 0%, hsl(${hue}, 40%, 60%) 100%)`;

					return (
						<div key={series.id} className="series-card">
							{/* Colored banner with the series title */}
							<div
								className="series-banner"
								style={{ background: bannerGradient }}
							>
								<span className="series-banner-title">{series.title}</span>
							</div>

							{/* Series information and pre-computed card statistics */}
							<div className="series-info">
								<h2 className="series-name">{series.title}</h2>
								<div className="series-meta-data">
									{/* Sermon count: handles 1 sermon vs multiple or 0 sermons */}
									{series.sermonCount !== 1
										? `${series.sermonCount} Sermons`
										: '1 Sermon'}

									{/* Date range: formats start/end years from server, or hides if series has no sermons */}
									{formatDateRange(series.firstDate, series.lastDate)}

									{/* Speaker info: displays speaker last name, 'Multiple speakers', or '0 Speakers' */}
									{formatSpeakers(series.speakers)}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Jack's Pagination component*/}
			<div
				style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}
			>
				<Pagination
					pageInfo={{ page: page, totalPages: totalPages }}
					onPageChange={setPage}
					isLoading={seriesQuery.isFetching}
				/>
			</div>

			{/* Modal to create a new series */}
			<NewSeriesModal
				isOpen={newSeriesOpen}
				onClose={() => setNewSeriesOpen(false)}
			/>
		</MainLayout>
	);
}

// Helper function to extract and format year range from YYYY-MM-DD date strings
function formatDateRange(
	firstDate: string | null,
	lastDate: string | null,
): string {
	// If the series has no sermons, dates are null so return empty string
	if (!firstDate || !lastDate) return '';
	const startYear = firstDate.slice(0, 4);
	const endYear = lastDate.slice(0, 4);
	// If sermons all took place in the same year, show single year; otherwise show range
	return startYear === endYear
		? ` • ${startYear}`
		: ` • ${startYear}-${endYear}`;
}

// Helper function to format speaker summary text
function formatSpeakers(
	speakers: Array<{ firstName: string; lastName: string }>,
): string {
	if (speakers.length === 0) return '';
	if (speakers.length === 1) return ` • ${speakers[0].lastName}`;
	return ' • Multiple speakers';
}

// Computes a deterministic hue (0-360) so the card banner gets a stable color based on its title and id
export function seriesHue(sId: number, sTitle: string): number {
	const digest = sId + sTitle;
	return MurmurHash3(digest).result() % 360;
}
