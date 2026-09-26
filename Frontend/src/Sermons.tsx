import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import SermonCard from '$/components/SermonCard';
import './Sermons.css';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';
import Loading from '$/components/Loading';
import FloatingAddSermon from '$/modals/AddSermon';
import { Series } from '$/types/series';
import { PaginatedSermons, type Status, statuses } from '$/types/sermon';
import { getFullName, Speaker } from '$/types/speaker';
import { CountedTag } from '$/types/tag';
import ErrorBox from './components/ErrorBox';
import { InfoBanner } from './components/InfoBanner';
import Pagination from './components/Pagination';

interface Filters {
	status: Status | null;
	topic: string | null;
	speakerID: number | null;
	seriesID: number | null;
}

const sortCategories = ['Newest', 'Oldest', 'Relevance'] as const;
type SortCategory = (typeof sortCategories)[number];

const PAGE_SIZE = 9;

export default function Sermons() {
	const [page, setPage] = useState<number>(1);
	const [filters, setFilters] = useState<Filters>({
		status: null,
		topic: null,
		speakerID: null,
		seriesID: null,
	});

	// Tracks the currently selected "freshness" filter, defaults to "Newest"
	const [sortCategory, setSortCategory] = useState<SortCategory>('Newest');

	// Complete metadata options loaded independently of displayed sermon page
	const speakersQuery = useQuery({
		queryKey: ['speakers'],
		queryFn: async () => {
			const res = await axios.get('/api/speakers');
			return Speaker.array().parseAsync(res.data);
		},
	});

	const seriesQuery = useQuery({
		queryKey: ['series'],
		queryFn: async () => {
			const res = await axios.get('/api/series');
			return Series.array().parseAsync(res.data);
		},
	});

	const tagsQuery = useQuery({
		queryKey: ['tags', { used: true }],
		queryFn: async () => {
			const res = await axios.get('/api/tags', { params: { used: true } });
			return CountedTag.array().parseAsync(res.data);
		},
	});

	// Paginated query with distinct query key including all filter, sorting, and pagination selections
	const sermonsQuery = useQuery({
		queryKey: [
			'paginated-sermons',
			{
				page,
				pageSize: PAGE_SIZE,
				status: filters.status,
				topic: filters.topic,
				speakerID: filters.speakerID,
				seriesID: filters.seriesID,
				sort: sortCategory,
			},
		],
		queryFn: async () => {
			const params: Record<string, string | number> = {
				page,
				pageSize: PAGE_SIZE,
				sort: sortCategory,
			};
			if (filters.status) params.status = filters.status;
			if (filters.topic) params.topic = filters.topic;
			if (filters.speakerID !== null) params.speaker_id = filters.speakerID;
			if (filters.seriesID !== null) params.series_id = filters.seriesID;

			const res = await axios.get('/api/sermons', { params });
			return PaginatedSermons.parseAsync(res.data);
		},
	});

	if (sermonsQuery.isError) {
		return (
			<SermonShell>
				<ErrorBox message="Failed to load sermons. Refresh the page and try again." />
			</SermonShell>
		);
	}

	if (speakersQuery.isError || seriesQuery.isError || tagsQuery.isError) {
		return (
			<SermonShell>
				<ErrorBox message="Failed to load sermon filters. Refresh the page and try again." />
			</SermonShell>
		);
	}

	if (
		sermonsQuery.isPending ||
		speakersQuery.isPending ||
		seriesQuery.isPending ||
		tagsQuery.isPending
	) {
		return (
			<SermonShell>
				<Loading vertical />
			</SermonShell>
		);
	}

	const speakerOptions = (speakersQuery.data ?? [])
		.toSorted((a, b) => a.id - b.id)
		.map(s => (
			<option key={s.id} value={s.id}>
				{getFullName(s)}
			</option>
		));

	const seriesOptions = (seriesQuery.data ?? [])
		.toSorted((a, b) => a.id - b.id)
		.map(s => (
			<option key={s.id} value={s.id}>
				{s.title}
			</option>
		));

	const availableTopics = (tagsQuery.data ?? []).map(t => t.name);

	const sermons = sermonsQuery.data.items;
	const sermonCards = sermons.map(sermon => (
		<div key={sermon.id} className="Sermons-cardLink">
			<SermonCard key={sermon.id} sermon={sermon} />
		</div>
	));

	return (
		<MainLayout title="Sermons" className="Sermons">
			{/* Sermon Filter Buttons, clicks set as active and update status */}
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
								onChange={() => {
									setFilters(prev => ({ ...prev, status: s }));
									setPage(1);
								}}
							/>
							{s ?? 'All'}
						</label>
					))}
				</fieldset>
			</div>

			{/* Sermon Topic Buttons, clicks set as active and update topic */}
			<fieldset className="Sermons-controls">
				<fieldset className="Sermons-topics">
					{[null, ...availableTopics].map(t => {
						const isSelected =
							(t === null && filters.topic === null) ||
							(t !== null && filters.topic?.toLowerCase() === t.toLowerCase());
						return (
							<label
								key={t ?? 'All'}
								className={clsx(
									'Sermons-topic',
									'u-button',
									isSelected && 'is-active',
								)}
							>
								<input
									type="radio"
									name="topic"
									hidden={true}
									value={t ?? 'All'}
									checked={isSelected}
									onChange={() => {
										setFilters(prev => ({ ...prev, topic: t }));
										setPage(1);
									}}
								/>
								{t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All'}
							</label>
						);
					})}
				</fieldset>

				{/* Sermon Speaker dropdown, selection updates speakerID */}
				<fieldset className="Sermons-dropdowns">
					<select
						className="Sermons-dropdown"
						value={filters.speakerID ?? 'All Speakers'}
						onChange={e => {
							const val = e.target.value;
							setFilters(prev => ({
								...prev,
								speakerID: val === 'All Speakers' ? null : parseInt(val, 10),
							}));
							setPage(1);
						}}
					>
						<option value="All Speakers">All Speakers</option>
						{speakerOptions}
					</select>

					{/* Sermon Series dropdown, selection updates seriesID */}
					<select
						className="Sermons-dropdown"
						value={filters.seriesID ?? 'All Series'}
						onChange={e => {
							const val = e.target.value;
							setFilters(prev => ({
								...prev,
								seriesID: val === 'All Series' ? null : parseInt(val, 10),
							}));
							setPage(1);
						}}
					>
						<option value="All Series">All Series</option>
						{seriesOptions}
					</select>

					{/* Video Upload Recency dropdown, selection updates sortCategory */}
					<select
						className="Sermons-dropdown"
						value={sortCategory}
						onChange={e => {
							setSortCategory(e.target.value as SortCategory);
							setPage(1);
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

			{sermons.length === 0 ? (
				<div className="Sermons-empty">
					<InfoBanner message="No sermons match the selected filters." />
				</div>
			) : (
				<div className="Sermons-grid">{sermonCards}</div>
			)}

			<Pagination
				pageInfo={sermonsQuery.data}
				onPageChange={setPage}
				isLoading={sermonsQuery.isFetching}
			/>

			<FloatingAddSermon />
		</MainLayout>
	);
}

// biome-ignore lint/complexity/noBannedTypes: we actually need an empty object here
function SermonShell({ children }: React.PropsWithChildren<{}>) {
	return (
		<MainLayout title="Sermons" className="Sermons">
			<div className="Sermons-scrollContainer">
				<fieldset disabled={true} className="Sermons-statuses">
					{[null, ...statuses].map(s => (
						<label
							key={s ?? 'All'}
							className={clsx('Sermons-status', 'u-button')}
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
					{[null, 'Faith', 'Hope', 'Grace', 'Healing', 'Anxiety'].map(t => (
						<label
							key={t ?? 'All'}
							className={clsx('Sermons-topic', 'u-button')}
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

			{children}
			<FloatingAddSermon />
		</MainLayout>
	);
}
