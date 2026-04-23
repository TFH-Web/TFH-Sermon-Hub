import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import SermonCard from './components/SermonCard';
import './Sermons.css';
import { sermons } from '$/data/sermons';
import clsx from 'clsx';

const categories = ['Published', 'Processing', 'Draft', 'Failed'] as const;
type Category = (typeof categories)[number];

const topics = ['Faith', 'Hope', 'Grace', 'Healing', 'Anxiety'] as const;
type Topic = (typeof topics)[number];

export default function Sermons() {
	// Tracks the currently selected sermon filter, defaults to null
	const [category, setCategory] = useState<Category | null>(null);

	// Tracks the currently selected topic filter, defaults to null
	const [topic, setTopic] = useState<Topic | null>(null);

	// Tracks the currently selected speaker filter, defaults to "All"
	const [selectedSpeaker, setSelectedSpeaker] = useState('All');

	// Tracks the currently selected series filter, defaults to "All"
	const [selectedSeries, setSelectedSeries] = useState('All');

	// Tracks the currently selected "freshness" filter, defaults to "Newest"
	const [_videoUploadRecency, setVideoUploadRecency] = useState('Newest');

	return (
		<MainLayout title="Sermons">
			{/* Sermon Filter Buttons, clicks set as active and update the selectedSermonFilter state */}
			<div className="Sermons-categories">
				{[null, ...categories].map(c => (
					<button
						key={c ?? 'All'}
						type="button"
						className={clsx('Sermons-category', category === c && 'is-active')}
						onClick={() => setCategory(c)}
					>
						{c ?? 'All'}
					</button>
				))}
			</div>

			{/* Sermon Topic Buttons, clicks set as active and update the selectedTopic state */}
			<div className="filters-container">
				<div className="Sermons-topics">
					{[null, ...topics].map(t => (
						<button
							key={t ?? 'All'}
							type="button"
							className={clsx('Sermons-topic', topic === t && 'is-active')}
							onClick={() => setTopic(t)}
						>
							{t ?? 'All'}
						</button>
					))}
				</div>

				{/* Sermon Speaker dropdown, selection updates the selectedSpeaker state */}
				<div className="sermon-filters">
					<select onChange={e => setSelectedSpeaker(e.target.value)}>
						<option value="All">All Speakers</option>
						<option value="Dave Patterson">Dave Patterson</option>
						<option value="Guest Speaker">Guest Speaker</option>
					</select>

					{/* Sermon Series dropdown, selection updates the selectedSeries state */}
					<select onChange={e => setSelectedSeries(e.target.value)}>
						<option value="All">All Series</option>
						<option value="Living Your Best Life">Living Your Best Life</option>
						<option value="Hope Rising">Hope Rising</option>
						<option value="Together">Together</option>
					</select>

					{/* Video Upload Recency dropdown, selection updates the videoUploadRecency state */}
					<select onChange={e => setVideoUploadRecency(e.target.value)}>
						<option value="Newest">Sort: Newest</option>
						<option value="Oldest">Sort: Oldest</option>
						<option value="Relevancy">Sort: Relevant</option>
					</select>
				</div>
			</div>

			<div className="sermon-grid">
				{sermons
					.filter(
						sermon =>
							(topic === null || sermon.tags.includes(topic)) &&
							(selectedSpeaker === 'All' ||
								sermon.speaker === selectedSpeaker) &&
							(selectedSeries === 'All' || sermon.series === selectedSeries),
					)
					.map(sermon => (
						<SermonCard key={sermon.title} sermon={sermon} />
					))}
			</div>
		</MainLayout>
	);
}
