import { useQuery } from '@tanstack/react-query'; // Hook to fetch data from the server and manage loading, error, and cached states
import axios from 'axios'; // Sends HTTP GET requests to our Flask backend API
import MurmurHash3 from 'imurmurhash'; // Generates a consistent hash number from text to pick a unique card banner color
import { useState } from 'react'; // React state to remember interactive values across renders (current page and popup visibility)
import MainLayout from '$/components/MainLayout'; // App layout wrapper containing the navigation bar and header
import NewSeriesModal from '$/modals/NewSeriesModal'; // Popup modal to create a new sermon series
import { type SeriesCard, SeriesPage } from '$/types/series'; // Zod types to validate the paginated series response
import './Series.css';

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
			return await SeriesPage.parseAsync(res.data);
		},
	});

	// If the backend request failed or network broke, show an error box with a retry button instead of a blank screen
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

	// While waiting for the backend to respond, show a loading placeholder
	if (seriesQuery.isPending) {
		return (
			<MainLayout title="Series" className="Series">
				<h1>Loading...</h1>
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
								className="series-card-banner"
								style={{ background: bannerGradient }}
							>
								<span className="series-banner-title">{series.title}</span>
							</div>

							{/* Series information and pre-computed card statistics */}
							<div className="series-info">
								<div className="series-name">{series.title}</div>
								<div className="series-meta-data">
									{/* Sermon count: handles 1 sermon vs multiple or 0 sermons */}
									{series.sermonCount !== 1
										? `${series.sermonCount} Sermons`
										: '1 Sermon'}
									{` * Series ID ${series.id}`}

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

			{/* Pagination controls to navigate between pages */}
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
				{/* Previous page button: disabled on page 1 */}
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
				{/* Next page button: disabled on the last page */}
				<button
					type="button"
					disabled={page >= totalPages}
					onClick={() => setPage(p => Math.min(totalPages, p + 1))}
				>
					Next
				</button>
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
		? ` * Date ${startYear}`
		: ` * Date ${startYear}-${endYear}`;
}

// Helper function to format speaker summary text
function formatSpeakers(
	speakers: Array<{ firstName: string; lastName: string }>,
): string {
	if (speakers.length === 0) return ' * 0 Speakers';
	if (speakers.length === 1) return ` * ${speakers[0].lastName}`;
	return ' * Multiple speakers';
}

// Computes a deterministic hue (0-360) so the card banner gets a stable color based on its title and id
export function seriesHue(sId: number, sTitle: string): number {
	const digest = sId + sTitle;
	return MurmurHash3(digest).result() % 360;
}
