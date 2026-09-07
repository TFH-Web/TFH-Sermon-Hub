import './Dashboard.css';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ImportActivity from '$/components/ImportActivity';
import MainLayout from '$/components/MainLayout';
import PopularTags from '$/components/PopularTags';
import RecentActivity from '$/components/RecentActivity';
import RecentSermonsTable from '$/components/RecentSermonsTable';
import StatCard from '$/components/StatCard';
import { Sermon } from '$/types/sermon';
import { Series } from '$/types/series';
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

	const seriesQuery = useQuery({
		queryKey: ['series'],
		queryFn: async () => {
			const res = await axios.get('/api/series');
			const series = await Series.array().parseAsync(res.data);
			return series;
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
				<StatCard
					label="Series"
					value={seriesQuery.data?.length}
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
