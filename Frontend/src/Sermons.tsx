import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import SermonCard from '$/components/SermonCard';
import './Sermons.css';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';
import FloatingAddSermon from '$/modals/AddSermon';
import type { Series } from '$/types/series';
import { Sermon, type Status, statuses } from '$/types/sermon';
import { getFullName, type Speaker } from '$/types/speaker';
import Loading from '$/components/Loading';

const topics = ['Faith', 'Hope', 'Grace', 'Healing', 'Anxiety'] as const;
type Topic = (typeof topics)[number];

interface Filters {
	status: Status | null;
	topic: Topic | null;
	speakerID: number | null;
	seriesID: number | null;
}

const sortCategories = ['Newest', 'Oldest', 'Relevance'] as const;
type SortCategory = (typeof sortCategories)[number];

export default function Sermons() {
	const query = useQuery({
		queryKey: ['sermons'],
		queryFn: async () => {
			const res = await axios.get('/api/sermons');
			const sermons = await Sermon.array().parseAsync(res.data);
			return sermons;
		},
	});

	const [filters, setFilters] = useState<Filters>({
		status: null,
		topic: null,
		speakerID: null,
		seriesID: null,
	});

	// Tracks the currently selected "freshness" filter, defaults to "Newest"
	const [sortCategory, setSortCategory] = useState<SortCategory>('Newest');

	// TODO: error state at error
	if (query.isError)
		return (
			<MainLayout title="Sermons" className="Sermons">
				<h1>Error!</h1>
			</MainLayout>
		);

	if (query.isPending)
		return (
			<MainLayout title="Sermons" className="Sermons">
				<div className="Sermons-scrollContainer">
					<fieldset disabled={true} className="Sermons-statuses">
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
								/>
								{s ?? 'All'}
							</label>
						))}
					</fieldset>
				</div>

				<fieldset className="Sermons-controls">
					<fieldset className="Sermons-topics" disabled={true}>
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
								/>
								{t ?? 'All'}
							</label>
						))}
					</fieldset>

					{/* Sermon Speaker dropdown, selection updates the selectedSpeaker state */}
					<fieldset className="Sermons-dropdowns">
						<select className="Sermons-dropdown" disabled={true}>
							<option>All Speakers</option>
						</select>

						{/* Sermon Series dropdown, selection updates the selectedSeries state */}
						<select className="Sermons-dropdown" disabled={true}>
							<option>All Series</option>
						</select>

						{/* Video Upload Recency dropdown, selection updates the videoUploadRecency state */}
						<select className="Sermons-dropdown" disabled={true}>
							{sortCategories.map(s => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</select>
					</fieldset>
				</fieldset>

				<Loading vertical />
				<FloatingAddSermon />
			</MainLayout>
		);

	const allSpeakers = query.data
		.map(sermon => sermon.speaker)
		.reduce<Map<number, Speaker>>((acc, speaker) => {
			acc.set(speaker.id, speaker);
			return acc;
		}, new Map());
	const speakerOptions = Array.from(allSpeakers.values())
		.toSorted((a, b) => a.id - b.id)
		.map(s => (
			<option key={s.id} value={s.id}>
				{getFullName(s)}
			</option>
		));

	const allSeries = query.data
		.map(sermon => sermon.series)
		.filter(s => s !== null && s !== undefined)
		.reduce<Map<number, Series>>((acc, series) => {
			acc.set(series.id, series);
			return acc;
		}, new Map());
	const seriesOptions = Array.from(allSeries.values())
		.toSorted((a, b) => a.id - b.id)
		.map(s => (
			<option key={s.id} value={s.id}>
				{s.title}
			</option>
		));

	const sermonCards = query.data
		.filter(s => filters.status === null || s.status === filters.status)
		.filter(
			s =>
				filters.topic === null ||
				s.tags.map(t => t.name).includes(filters.topic.toLowerCase()),
		)
		.filter(
			s => filters.speakerID === null || s.speaker.id === filters.speakerID,
		)
		.filter(s => filters.seriesID === null || s.series?.id === filters.seriesID)
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
		));

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
								speakerID:
									e.target.value === 'All Speakers'
										? null
										: parseInt(e.target.value, 10),
							})
						}
					>
						<option>All Speakers</option>
						{speakerOptions}
					</select>

					{/* Sermon Series dropdown, selection updates the selectedSeries state */}
					<select
						className="Sermons-dropdown"
						onChange={e =>
							setFilters({
								...filters,
								seriesID:
									e.target.value === 'All Series'
										? null
										: parseInt(e.target.value, 10),
							})
						}
					>
						<option>All Series</option>
						{seriesOptions}
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

			<div className="Sermons-grid">{sermonCards}</div>
			<FloatingAddSermon />
		</MainLayout>
	);
}
