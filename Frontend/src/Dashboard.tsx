import MainLayout from '$/components/MainLayout';

import StatCard from '$/components/StatCard';
import RecentSermonsCard, { type Sermon } from '$/components/RecentSermonsTable';

{/* Mock data for recent sermons */}
const recentSermons: Sermon[] = [
  { id: '1', title: 'Under Grace',        speaker: 'Dave Patterson', series: 'Live Your Best Life', date: 'Feb 23', status: 'Published'  },
  { id: '2', title: 'Walking in Freedom', speaker: 'Dave Patterson', series: 'Live Your Best Life', date: 'Feb 16', status: 'Published'  },
  { id: '3', title: 'Anchored in Hope',   speaker: 'Guest Speaker',  series: 'Hope Rising',         date: 'Feb 9',  status: 'Processing' },
  { id: '4', title: 'Power of Community', speaker: 'Dave Patterson', series: 'Together',            date: 'Feb 2',  status: 'Published'  },
  { id: '5', title: 'Bold Faith',         speaker: 'Dave Patterson', series: 'Fearless',            date: 'Jan 26', status: 'Failed'     },
];

export default function Dashboard() {
	return (
		<MainLayout title="Dashboard">
		<div>
			{/* Mock data for statistics */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: "16px"}}>
				<StatCard label="Total Sermons"   value="2,437" trend="12 this month"/>
				<StatCard label="Series"          value="124"   trend="2 new" />
				<StatCard label="Speakers"        value="28" />
				<StatCard label="Searches Today"  value="89"    trend="23%" />
			</div>
			<div style={{ padding: '0 24px 24px' }}>
				<RecentSermonsCard sermons={recentSermons} />
			</div>
		</div>
		</MainLayout>
	);
}
