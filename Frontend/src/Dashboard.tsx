import ImportActivity from '$/components/ImportActivity';
import MainLayout from '$/components/MainLayout';
import PopularTags from '$/components/PopularTags';
import RecentActivity from '$/components/RecentActivity';
import RecentSermonsCard, {
	type Sermon,
} from '$/components/RecentSermonsTable';
import StatCard from '$/components/StatCard';
import './Dashboard.css';

// Mock data for recent sermons — will be replaced with API calls when backend is ready
const recentSermons: Sermon[] = [
	{
		id: '1',
		title: 'Under Grace',
		speaker: 'Dave Patterson',
		series: 'Live Your Best Life',
		date: 'Feb 23',
		status: 'Published',
	},
	{
		id: '2',
		title: 'Walking in Freedom',
		speaker: 'Dave Patterson',
		series: 'Live Your Best Life',
		date: 'Feb 16',
		status: 'Published',
	},
	{
		id: '3',
		title: 'Anchored in Hope',
		speaker: 'Guest Speaker',
		series: 'Hope Rising',
		date: 'Feb 9',
		status: 'Processing',
	},
	{
		id: '4',
		title: 'Power of Community',
		speaker: 'Dave Patterson',
		series: 'Together',
		date: 'Feb 2',
		status: 'Published',
	},
	{
		id: '5',
		title: 'Bold Faith',
		speaker: 'Dave Patterson',
		series: 'Fearless',
		date: 'Jan 26',
		status: 'Failed',
	},
];

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
					<RecentSermonsCard sermons={recentSermons} />
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
