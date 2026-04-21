import ImportActivity from '$/components/ImportActivity';
import MainLayout from '$/components/MainLayout';
import PopularTags from '$/components/PopularTags';
import RecentActivity from '$/components/RecentActivity';
import RecentSermonsTable from '$/components/RecentSermonsTable';
import StatCard from '$/components/StatCard';
import { sampleSermons } from '$/types/sermon';
import './Dashboard.css';

export default function Dashboard() {
	return (
		<MainLayout title="Dashboard">
			{/* Top row: 4 stat cards */}
			<div className="Dashboard-stats">
				<StatCard label="Total Sermons" value="2,437" trend="12 this month" />
				<StatCard label="Series" value="124" trend="2 new" />
				<StatCard label="Speakers" value="28" />
				<StatCard label="Searches Today" value="89" trend="23%" />
			</div>

			{/* Bottom: main content + right sidebar */}
			<div className="Dashboard-body">
				{/* Left: recent sermons table + import activity */}
				<div>
					<RecentSermonsTable sermons={sampleSermons} />
					<ImportActivity />
				</div>

				{/* Right: recent activity feed + popular tags */}
				<div>
					<RecentActivity />
					<PopularTags />
				</div>
			</div>
		</MainLayout>
	);
}
