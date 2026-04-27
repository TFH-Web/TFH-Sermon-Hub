import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import SermonCard from '$/components/SermonCard';
import './Sermons.css';
import clsx from 'clsx';
import { sermons } from '$/data/sermons';
import FloatingAddSermon from '$/modals/AddSermon';
import { type Status, statuses } from '$/types/sermon';

const topics = ['Faith', 'Hope', 'Grace', 'Healing', 'Anxiety'] as const;
type Topic = (typeof topics)[number];

type SetElement<SetType> =
	SetType extends Iterable<infer ElementType> ? ElementType : never;

const speakers = new Set(sermons.map(s => s.speaker));
type Speaker = SetElement<typeof speakers>;

const seriess = new Set(sermons.map(s => s.series).filter(s => s !== null));
type Series = SetElement<typeof seriess>;

const sortCategories = ['Newest', 'Oldest', 'Relevance'] as const;
type SortCategory = (typeof sortCategories)[number];

export default function Sermons() {
	// Tracks the currently selected sermon filter, defaults to null
	const [status, setStatus] = useState<Status | null>(null);

	// Tracks the currently selected topic filter, defaults to null
	const [topic, setTopic] = useState<Topic | null>(null);

	// Tracks the currently selected speaker filter, defaults to null
	const [speaker, setSpeaker] = useState<Speaker | null>(null);

	// Tracks the currently selected series filter, defaults to null
	const [series, setSeries] = useState<Series | null>(null);

	// Tracks the currently selected "freshness" filter, defaults to "Newest"
	const [sortCategory, setSortCategory] = useState<SortCategory>('Newest');

	return (
		<MainLayout title="Sermons" className="Sermons">
			{/* Sermon Filter Buttons, clicks set as active and update the selectedSermonFilter state */}
			<div className="Sermons-scrollContainer">
				<fieldset className="Sermons-statuses">
					{[null, ...statuses].map(s => (
						<label
							key={s ?? 'All'}
							className={clsx(
								'Sermons-status',
								'u-button',
								status === s && 'is-active',
							)}
						>
							<input
								type="radio"
								name="status"
								hidden={true}
								value={s ?? 'All'}
								checked={s === status}
								onChange={e => {
									return setStatus(
										// @ts-expect-error 2345: value comes from iterating over an array marked as const
										e.target.value === 'All' ? null : e.target.value,
									);
								}}
							/>
							{s ?? 'All'}
						</label>
					))}
				</fieldset>
			</div>

			{/* Sermon Topic Buttons, clicks set as active and update the selectedTopic state */}
			<fieldset className="Sermons-controls">
				<fieldset className="Sermons-topics">
					{[null, ...topics].map(t => (
						<label
							key={t ?? 'All'}
							className={clsx(
								'Sermons-topic',
								'u-button',
								topic === t && 'is-active',
							)}
						>
							<input
								type="radio"
								name="topic"
								hidden={true}
								value={t ?? 'All'}
								checked={t === topic}
								onChange={e => {
									return setTopic(
										// @ts-expect-error 2345: value comes from iterating over an array marked as const
										e.target.value === 'All' ? null : e.target.value,
									);
								}}
							/>
							{t ?? 'All'}
						</label>
					))}
				</fieldset>

				{/* Sermon Speaker dropdown, selection updates the selectedSpeaker state */}
				<fieldset className="Sermons-dropdowns">
					<select
						className="Sermons-dropdown"
						onChange={e =>
							setSpeaker(
								e.target.value === 'All Speakers' ? null : e.target.value,
							)
						}
					>
						{['All Speakers', ...speakers].map(s => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>

					{/* Sermon Series dropdown, selection updates the selectedSeries state */}
					<select
						className="Sermons-dropdown"
						onChange={e =>
							setSeries(e.target.value === 'All Series' ? null : e.target.value)
						}
					>
						{['All Series', ...seriess].map(s => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>

					{/* Video Upload Recency dropdown, selection updates the videoUploadRecency state */}
					<select
						className="Sermons-dropdown"
						onChange={e => {
							// @ts-expect-error 2345: value comes from iterating over an array marked as const
							return setSortCategory(e.target.value);
						}}
					>
						{sortCategories.map(s => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
				</fieldset>
			</fieldset>

			<div className="Sermons-grid">
				{sermons
					.filter(s => status === null || s.status === status)
					.filter(s => topic === null || s.tags.includes(topic.toLowerCase()))
					.filter(s => speaker === null || s.speaker === speaker)
					.filter(s => series === null || s.series === series)
					.toSorted((a, b) => {
						switch (sortCategory) {
							case 'Oldest':
								return a.date.getTime() - b.date.getTime();
							default:
								return b.date.getTime() - a.date.getTime();
						}
					})
					.map(sermon => (
						<SermonCard key={sermon.title} sermon={sermon} />
					))}
			</div>
			<FloatingAddSermon />
		</MainLayout>
	);
}
