import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import MurmurHash3 from 'imurmurhash';
import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import NewSeriesModal from '$/modals/NewSeriesModal';
import { Series } from '$/types/series';
import { Sermon } from '$/types/sermon';
import type { Speaker } from '$/types/speaker';
import './Series.css';

// Mock data for sermon series, each series will have a unique gradient color for the banner
// const series = [
// 	{
// 		title: 'A Life of Freedom',
// 		speaker: 'Multiple Speakers',
// 		year: 2026,
// 		sermonCount: 2,
// 		banner: 'linear-gradient(135deg, #4a6741 0%, #3a5232 100%)',
// 	},
// 	{
// 		title: 'A Study in the Book of Philippians',
// 		speaker: 'Multiple Speakers',
// 		year: 2026,
// 		sermonCount: 5,
// 		banner: 'linear-gradient(135deg, #1e2f40 0%, #162430 100%)',
// 	},
// 	{
// 		title: 'New Ground',
// 		speaker: 'Dave Patterson',
// 		year: 2026,
// 		sermonCount: 2,
// 		banner: 'linear-gradient(135deg, #7a6030 0%, #5e4920 100%)',
// 	},
// 	{
// 		title: 'I Can Relate',
// 		speaker: 'Dave Patterson',
// 		year: 2025,
// 		sermonCount: 2,
// 		banner: 'linear-gradient(135deg, #3d5c3a 0%, #2d4529 100%)',
// 	},
// 	{
// 		title: 'New Testament Believer',
// 		speaker: 'Dave Patterson',
// 		year: 2025,
// 		sermonCount: 1,
// 		banner: 'linear-gradient(135deg, #5b4a7a 0%, #46385f 100%)',
// 	},
// ];

let seriess: Series[]; //stores all officially recognized series into an array

// Component to display the list of sermon series
export default function Seriess() {
	const [newSeriesOpen, setNewSeriesOpen] = useState(false);

	//querying for series data (id, title)
	const seriesQuery = useQuery({
		queryKey: ['series'],
		queryFn: async () => {
			const res = await axios.get('/api/series');
			seriess = await Series.array().parseAsync(res.data); //stores queried data into seriess
			return seriess;
		},
	});

	const [sermons, setSermons] = useState<Sermon[]>([]); //using useState in order to use forEach loop

	//querying for sermon data (id, title, videoLink, duration, date, description, tags, transcript, summary, speaker, series, status)
	const sermonQuery = useQuery({
		queryKey: ['sermons'],
		queryFn: async () => {
			const res = await axios.get('/api/sermons');
			setSermons(await Sermon.array().parseAsync(res.data));
			return sermons;
		},
	});

	// TODO: error state at error
	if (seriesQuery.isError) {
		seriess = [];
		return (
			<MainLayout title="Series" className="Series">
				<h1>Error!</h1>
			</MainLayout>
		);
	}

	if (sermonQuery.isError) {
		setSermons([]);
		return (
			<MainLayout title="Series" className="Series">
				<h1>Error!</h1>
			</MainLayout>
		);
	}

	// TODO: loading state while pending
	if (seriesQuery.isPending || sermonQuery.isPending)
		return (
			<MainLayout title="Series" className="Series">
				<h1>Loading...</h1>
			</MainLayout>
		);

	//create type to store stats
	type SeriesStats = {
		count: number;
		startYear: number;
		endYear: number;
		speakers: Speaker[];
		banner: string;
	};

	const statsBySeriesId = new Map<number, SeriesStats>();
	const seriesById = new Map<number, Series>(
		seriess.map(item => [item.id, item]),
	);
	//now that we have both the series and sermon data, we can display the page
	if (seriesQuery.isSuccess && sermonQuery.isSuccess) {
		// console.log("setting up stats");
		//mapping stats for each series in one pass corresponding to series.id
		console.log(`looking through ${sermons.length} sermons`);

		//initialize series stats
		seriess.forEach((series: Series) => {
			const hue = seriesHue(series.id, series.title ?? '');
			statsBySeriesId.set(series.id, {
				count: 0,
				startYear: Number.MAX_SAFE_INTEGER,
				endYear: Number.MIN_SAFE_INTEGER,
				speakers: [],
				banner: `linear-gradient(
            135deg, 
            hsl(${hue}, 40%, 30%) 0%, 
            hsl(${hue}, 40%, 60%) 100%
            )`,
			});
		});

		//update data with sermons
		sermons.forEach((sermon: Sermon) => {
			let seriesId = sermon.series?.id as number;

			if (seriesId === undefined) {
				seriesId = -1; //if no series, then use -1 for ungrouped sermons
			}

			//create new key if series is completely new or has no category
			if (!statsBySeriesId.has(seriesId)) {
				//console.log(`new series: ${seriesId}`);
				const hue = seriesHue(seriesId, seriesById.get(seriesId)?.title ?? '');
				statsBySeriesId.set(seriesId, {
					count: 0,
					startYear: Number.MAX_SAFE_INTEGER,
					endYear: Number.MIN_SAFE_INTEGER,
					speakers: [],
					banner: `linear-gradient(
            135deg, 
            hsl(${hue}, 40%, 30%) 0%, 
            hsl(${hue}, 40%, 60%) 100%
            )`,
				});
			}
			const currentStats = statsBySeriesId.get(seriesId);

			if (currentStats) {
				currentStats.count++;
				currentStats.startYear = Math.min(
					currentStats.startYear,
					sermon.date.getFullYear(),
				);
				currentStats.endYear = Math.max(
					currentStats.endYear,
					sermon.date.getFullYear(),
				);
				if (!currentStats.speakers.includes(sermon.speaker)) {
					currentStats.speakers.push(sermon.speaker);
				}
			}
		});

		// console.log("loading main series page");
		return (
			<MainLayout title="Series">
				{/* Top Right New Series Button */}
				<div className="series-header">
					{/* Title for page */}
					<p className="series-section-title">Sermon Series</p>
					{/* Wired up NewSeriesModal from TFH-299 */}
					<button
						type="button"
						className="new-series-button"
						onClick={() => setNewSeriesOpen(true)}
					>
						+ New Series
					</button>
				</div>

				<div className="series-grid">
					{seriess.map(series => (
						<div key={series.id} className="series-card">
							<div
								className="series-banner"
								style={{ background: statsBySeriesId.get(series.id)?.banner }}
							>
								<span className="series-banner-title">{series.title}</span>
							</div>
							<div className="series-info">
								<div className="series-name">{series.title}</div>
								<div className="series-meta-data">
									{(statsBySeriesId.get(series.id)?.count ?? 0) !== 1
										? `${statsBySeriesId.get(series.id)?.count ?? 0} Sermons`
										: `1 Sermon`}

									{` • Series ID ${series.id}`}

									{(statsBySeriesId.get(series.id)?.count ?? 0) === 0
										? ``
										: statsBySeriesId.get(series.id)?.startYear ===
												statsBySeriesId.get(series.id)?.endYear
											? ` • Date ${statsBySeriesId.get(series.id)?.startYear ?? `Unknown`}`
											: ` • Date ${statsBySeriesId.get(series.id)?.startYear ?? `Unknown`} - ${statsBySeriesId.get(series.id)?.endYear ?? `Unknown`}`}

									{statsBySeriesId.get(series.id)?.speakers.length === 0
										? ` • 0 Speakers`
										: statsBySeriesId.get(series.id)?.speakers.length === 1
											? ` • ${statsBySeriesId.get(series.id)?.speakers[0].lastName}`
											: ` • Multiple speakers`}
								</div>
							</div>
						</div>
					))}
				</div>

				{/* New Series Modal, opens when the New Series button is clicked */}
				<NewSeriesModal
					isOpen={newSeriesOpen}
					onClose={() => setNewSeriesOpen(false)}
				/>
			</MainLayout>
		);
	}
}

//function to create a hue based on the series id and title
export function seriesHue(sId: number, sTitle: string): number {
	const digest = sId + sTitle;
	const hue = MurmurHash3(digest).result() % 360;
	return hue;
}
