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
	return (
		<MainLayout title="Dashboard">
			{/* Top row: 4 stat cards */}
			<section className="Dashboard-stats">
				<StatCard label="Total Sermons" value={2437} trend="12 this month" />
				<StatCard label="Series" value={124} trend="2 new" />
				<StatCard label="Speakers" value={28} />
				<StatCard label="Searches Today" value={89} trend="23%" />
			</section>

			{/* Bottom: main content + right sidebar */}
			<div className="Dashboard-body">
				{/* Left: recent sermons table + import activity */}
				<div className="DashboardBody-main">
					<RecentSermonsTable sermons={sermons} />
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
