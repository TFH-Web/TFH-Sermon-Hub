import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import SermonCard from './components/SermonCard';
import './Sermons.css';
import { sermons } from '$/data/sermons';
import clsx from 'clsx';

const categories = [
	'All',
	'Published',
	'Processing',
	'Draft',
	'Failed',
] as const;
type Category = (typeof categories)[number];

export default function Sermons() {
	// Tracks the currently selected sermon filter, defaults to "All"
	const [category, setCategory] = useState<Category>('All');

	// Tracks the currently selected topic filter, defaults to "All"
	const [selectedTopic, setSelectedTopic] = useState('All');

	// Tracks the currently selected speaker filter, defaults to "All"
	const [selectedSpeaker, setSelectedSpeaker] = useState('All');

	// Tracks the currently selected series filter, defaults to "All"
	const [selectedSeries, setSelectedSeries] = useState('All');

	// Tracks the currently selected "freshness" filter, defaults to "Newest"
	const [_videoUploadRecency, setVideoUploadRecency] = useState('Newest');

	return (
		<MainLayout title="Sermons">
			{/* Sermon Filter Buttons, clicks set as active and update the selectedSermonFilter state */}
			<div className="Sermon-categories">
				{categories.map(c => (
					<button
						key={c}
						type="button"
						className={clsx('Sermons-category', category === c && 'is-active')}
						onClick={() => setCategory(c)}
					>
						{c}
					</button>
				))}
			</div>

			{/* Sermon Topic Buttons, clicks set as active and update the selectedTopic state */}
			<div className="filters-container">
				<div className="topic-filters">
					<button
						type="button"
						className={
							selectedTopic === 'All' ? 'active-topic-filter' : 'topic-pill'
						}
						onClick={() => setSelectedTopic('All')}
					>
						All
					</button>
					<button
						type="button"
						className={
							selectedTopic === 'Faith' ? 'active-topic-filter' : 'topic-pill'
						}
						onClick={() => setSelectedTopic('Faith')}
					>
						Faith
					</button>
					<button
						type="button"
						className={
							selectedTopic === 'Hope' ? 'active-topic-filter' : 'topic-pill'
						}
						onClick={() => setSelectedTopic('Hope')}
					>
						Hope
					</button>
					<button
						type="button"
						className={
							selectedTopic === 'Grace' ? 'active-topic-filter' : 'topic-pill'
						}
						onClick={() => setSelectedTopic('Grace')}
					>
						Grace
					</button>
					<button
						type="button"
						className={
							selectedTopic === 'Healing' ? 'active-topic-filter' : 'topic-pill'
						}
						onClick={() => setSelectedTopic('Healing')}
					>
						Healing
					</button>
					<button
						type="button"
						className={
							selectedTopic === 'Anxiety' ? 'active-topic-filter' : 'topic-pill'
						}
						onClick={() => setSelectedTopic('Anxiety')}
					>
						Anxiety
					</button>
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
							(selectedTopic === 'All' ||
								sermon.tags.includes(selectedTopic)) &&
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
