import './Dashboard.css';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ImportActivity from '$/components/ImportActivity';
import MainLayout from '$/components/MainLayout';
import PopularTags from '$/components/PopularTags';
import RecentActivity from '$/components/RecentActivity';
import RecentSermonsTable from '$/components/RecentSermonsTable';
import StatCard from '$/components/StatCard';
import { SeriesPage } from '$/types/series';
import { PaginatedSermons } from '$/types/sermon';
import { PaginatedSpeakers } from '$/types/speaker';

const RECENT_SERMONS_COUNT = 5;
const RECENT_SERMONS_PARAMS = {
	page: 1,
	pageSize: RECENT_SERMONS_COUNT,
	sort: 'Newest',
} as const;

export default function Dashboard() {
	const sermonsQuery = useQuery({
		// Keep the paginated dashboard response separate from legacy array caches.
		queryKey: ['sermons', 'dashboard', RECENT_SERMONS_PARAMS],
		queryFn: async () => {
			const res = await axios.get('/api/sermons', {
				params: RECENT_SERMONS_PARAMS,
			});
			return PaginatedSermons.parseAsync(res.data);
		},
	});

	const seriesQuery = useQuery({
		queryKey: ['series', 'count'],
		queryFn: async () => {
			// Series uses per_page rather than the shared pageSize parameter.
			const res = await axios.get('/api/series', {
				params: { page: 1, per_page: 1 },
			});
			return SeriesPage.parseAsync(res.data);
		},
	});

	const speakersQuery = useQuery({
		queryKey: ['speakers', 'count'],
		queryFn: async () => {
			const res = await axios.get('/api/speakers', {
				params: { page: 1, pageSize: 1 },
			});
			return PaginatedSpeakers.parseAsync(res.data);
		},
	});

	const recentSermons = sermonsQuery.data?.items ?? [];

	return (
		<MainLayout title="Dashboard">
			{/* Top row: 4 stat cards */}
			{/*
			 * Existing paginated endpoints provide full-library totals without
			 * downloading complete lists. The bounded sermon page also supplies
			 * the recent rows in the server's date/ID order. Each query retains
			 * its own loading and retry state; no analytics service is needed.
			 */}
			<section className="Dashboard-stats">
				<StatCard
					label="Total Sermons"
					value={sermonsQuery.data?.total}
					isLoading={sermonsQuery.isPending}
					isError={sermonsQuery.isError}
					onRetry={() => sermonsQuery.refetch()}
				/>
				{/* Displays total series count directly from the backend total metadata */}
				<StatCard
					label="Series"
					value={seriesQuery.data?.total}
					isLoading={seriesQuery.isPending}
					isError={seriesQuery.isError}
					onRetry={() => seriesQuery.refetch()}
				/>
				<StatCard
					label="Speakers"
					value={speakersQuery.data?.total}
					isLoading={speakersQuery.isPending}
					isError={speakersQuery.isError}
					onRetry={() => speakersQuery.refetch()}
				/>
				<StatCard
					label="Searches Today"
					value="–"
					caption="Search tracking not available yet"
				/>
			</section>

			{/* Bottom: main content + right sidebar */}
			<div className="Dashboard-body">
				{/* Left: recent sermons table + import activity */}
				<div className="DashboardBody-main">
					<RecentSermonsTable
						sermons={recentSermons}
						isLoading={sermonsQuery.isPending}
						isError={sermonsQuery.isError}
						onRetry={() => sermonsQuery.refetch()}
					/>
					<ImportActivity />
				</div>

				{/* Right: recent activity feed + popular tags */}
				<div className="DashboardBody-side">
					<RecentActivity />
					<PopularTags />
				</div>
			</div>
		</MainLayout>
	);
}
