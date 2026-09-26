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
import { Sermon } from '$/types/sermon';
import { Speaker } from '$/types/speaker';

const RECENT_SERMONS_COUNT = 5;

export default function Dashboard() {
	const sermonsQuery = useQuery({
		queryKey: ['sermons'],
		queryFn: async () => {
			const res = await axios.get('/api/sermons');
			const sermons = await Sermon.array().parseAsync(res.data);
			return sermons;
		},
	});

	// Ask the server for the total series count for the dashboard stat card
	const seriesQuery = useQuery({
		// Unique cache key with 'count' so it doesn't conflict with the full Series page query cache
		queryKey: ['series', 'count'],
		queryFn: async () => {
			// Ask for only 1 item per page so we don't waste bandwidth downloading all series just to get the total count
			const res = await axios.get('/api/series?per_page=1');
			// Validate that the server response matches our paginated SeriesPage schema
			return await SeriesPage.parseAsync(res.data);
		},
	});

	const speakersQuery = useQuery({
		queryKey: ['speakers'],
		queryFn: async () => {
			const res = await axios.get('/api/speakers');
			const speakers = await Speaker.array().parseAsync(res.data);
			return speakers;
		},
	});

	const recentSermons = (sermonsQuery.data ?? [])
		.toSorted((a, b) => b.date.getTime() - a.date.getTime())
		.slice(0, RECENT_SERMONS_COUNT);

	return (
		<MainLayout title="Dashboard">
			{/* Top row: 4 stat cards */}
			{/*
			 * Counts below are derived client-side (array .length) from the full
			 * /api/sermons, /api/series, and /api/speakers lists we already fetch
			 * for this page. That's deliberate for now — the backend has no
			 * dedicated stats endpoint, and the current data volumes are small.
			 * Once the lists get large, this wastes bandwidth shipping full
			 * records just to count them; Sprint 6 will add a proper stats
			 * route that returns counts computed server-side.
			 *
			 * Three independent requests feed this page (sermons, series,
			 * speakers), so each card/section renders its own loading and
			 * error state from its own query.
			 */}
			<section className="Dashboard-stats">
				<StatCard
					label="Total Sermons"
					value={sermonsQuery.data?.length}
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
					value={speakersQuery.data?.length}
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
