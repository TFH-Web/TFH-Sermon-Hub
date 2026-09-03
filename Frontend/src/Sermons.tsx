import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import SermonCard from '$/components/SermonCard';
import './Sermons.css';
import { QueryCache, QueryClient, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';
import { useToast } from '$/components/ToastContext';
import { sermons } from '$/data/sermons';
import FloatingAddSermon from '$/modals/AddSermon';
import { Sermon, type Status, statuses } from '$/types/sermon';
import { getFullName } from '$/types/speaker';

const topics = ['Faith', 'Hope', 'Grace', 'Healing', 'Anxiety'] as const;
type Topic = (typeof topics)[number];

type SetElement<SetType> =
	SetType extends Iterable<infer ElementType> ? ElementType : never;

const speakers = new Set(sermons.map(s => getFullName(s.speaker)));
type Speaker = SetElement<typeof speakers>;

const seriess = new Set(
	sermons.map(s => s.series?.title).filter(s => s !== null && s !== undefined),
);
type Series = SetElement<typeof seriess>;

interface Filters {
	status: Status | null;
	topic: Topic | null;
	speaker: Speaker | null;
	series: Series | null;
}

const sortCategories = ['Newest', 'Oldest', 'Relevance'] as const;
type SortCategory = (typeof sortCategories)[number];

export default function Sermons() {
	const { showToast } = useToast();

	const queryClient = new QueryClient({
		queryCache: new QueryCache({
			onError: error =>
				showToast(`Something went wrong: ${error.message}`, 'error'),
		}),
	});
	const query = useQuery(
		{
			queryKey: ['sermons'],
			queryFn: async () => {
				const res = await axios.get('/sermons');
				const sermons = await Sermon.array().parseAsync(res.data);
				return sermons;
			},
		},
		queryClient,
	);
	console.log(query);

	const [filters, setFilters] = useState<Filters>({
		status: null,
		topic: null,
		speaker: null,
		series: null,
	});

	// Tracks the currently selected "freshness" filter, defaults to "Newest"
	const [sortCategory, setSortCategory] = useState<SortCategory>('Newest');

	// TODO: error state at error
	if (query.isError) return;

	// TODO: loading state while pending
	if (query.isPending) return;

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
								filters.status === s && 'is-active',
							)}
						>
							<input
								type="radio"
								name="status"
								hidden={true}
								value={s ?? 'All'}
								checked={s === filters.status}
								onChange={e => {
									return setFilters({
										...filters,
										// @ts-expect-error 2345: value comes from iterating over an array marked as const
										status: e.target.value === 'All' ? null : e.target.value,
									});
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
								filters.topic === t && 'is-active',
							)}
						>
							<input
								type="radio"
								name="topic"
								hidden={true}
								value={t ?? 'All'}
								checked={t === filters.topic}
								onChange={e => {
									return setFilters({
										...filters,
										// @ts-expect-error 2345: value comes from iterating over an array marked as const
										topic: e.target.value === 'All' ? null : e.target.value,
									});
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
							setFilters({
								...filters,
								speaker:
									e.target.value === 'All Speakers' ? null : e.target.value,
							})
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
							setFilters({
								...filters,
								series: e.target.value === 'All Series' ? null : e.target.value,
							})
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
				{query.data
					.filter(s => filters.status === null || s.status === filters.status)
					.filter(
						s =>
							filters.topic === null ||
							s.tags.map(t => t.name).includes(filters.topic.toLowerCase()),
					)
					.filter(
						s =>
							filters.speaker === null ||
							getFullName(s.speaker) === filters.speaker,
					)
					.filter(
						s => filters.series === null || s.series?.title === filters.series,
					)
					.toSorted((a, b) => {
						switch (sortCategory) {
							case 'Oldest':
								return a.date.getTime() - b.date.getTime();
							default:
								return b.date.getTime() - a.date.getTime();
						}
					})
					.map(sermon => (
						<div key={sermon.id} className="Sermons-cardLink">
							<SermonCard key={sermon.id} sermon={sermon} />
						</div>
					))}
			</div>
			<FloatingAddSermon />
		</MainLayout>
	);
}
