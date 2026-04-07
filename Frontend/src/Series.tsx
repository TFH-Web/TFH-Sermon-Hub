import MainLayout from '$/components/MainLayout';

import './Series.css';


// Mock data for sermon series, each series will have a unique gradient color for the banner
const series = [
	{
		title: 'Live Your Best Life',
		speaker: 'Dave Patterson',
		year: 2026,
		sermonCount: 6,
		banner: 'linear-gradient(135deg, #4a6741 0%, #3a5232 100%)',
	},
	{
		title: 'Hope Rising',
		speaker: 'Multiple Speakers',
		year: 2025,
		sermonCount: 8,
		banner: 'linear-gradient(135deg, #1e2f40 0%, #162430 100%)',
	},
	{
		title: 'Fearless',
		speaker: 'Dave Patterson',
		year: 2025,
		sermonCount: 5,
		banner: 'linear-gradient(135deg, #7a6030 0%, #5e4920 100%)',
	},
	{
		title: 'Together',
		speaker: 'Dave Patterson',
		year: 2026,
		sermonCount: 4,
		banner: 'linear-gradient(135deg, #3d5c3a 0%, #2d4529 100%)',
	},
];


// Component to display the list of sermon series
export default function Series() {
	{/* TODO: wire up AI search logic once teammate's branch is merged to dev */}
	return (
		<MainLayout title="Series">
			{/* Top Right New Series Button */}
			<div className="series-header">
				{/* Title for page */}
				<h2 className="series-section-title">Sermon Series</h2>
				{/* TODO: wire up the NewSeriesModal once TFH-299 is merged to dev */}
				<button type="button"  className="new-series-button">
					+ New Series
				</button>
			</div>

			{/* Series List as a Grid */}
			<div className="series-grid">				
				{series.map((series => (
					<div key={series.title} className="series-card">
						<div className="series-banner" style={{ background: series.banner }}>
							<span className="series-banner-title">{series.title}</span>
						</div>
						<div className="series-info">
							<div className="series-name">{series.title}</div>
							<div className="series-meta-data">
								{series.sermonCount} sermons • {series.speaker} • {series.year}
							</div>
						</div>
					</div>
				)))}
			</div>		
		</MainLayout>
	);
}