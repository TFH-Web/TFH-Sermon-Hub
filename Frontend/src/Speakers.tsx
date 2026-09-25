import SpeakerCard from '$/components/SpeakerCard';
import './Speakers.css';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useState } from 'react';
import ErrorBox from '$/components/ErrorBox';
import { InfoBanner } from '$/components/InfoBanner';
import Loading from '$/components/Loading';
import MainLayout from '$/components/MainLayout';
import Pagination from '$/components/Pagination';
import { speakers } from '$/data/speakers';
import { CountedSpeaker, PaginatedSpeakers } from '$/types/speaker';

const PAGE_SIZE = 10;

const sortCategories = ['Default', 'A-Z', 'Z-A'] as const;
type SortCategory = (typeof sortCategories)[number];

// displays grid of SpeakerCard components from given list of speakers
export default function Speakers() {
	const [page, setPage] = useState<number>(1);
	const [sortCategory, setSortCategory] = useState<SortCategory>('Default');

	const speakersQuery = useQuery({
		queryKey: [
			'paginated-speakers',
			{
				page,
				pageSize: PAGE_SIZE,
				sort: sortCategory,
			},
		],
		queryFn: async () => {
			const params: Record<string, string | number> = {
				page,
				pageSize: PAGE_SIZE,
				sort: sortCategory,
			};

			const res = await axios.get('/api/speakers', { params });
			return PaginatedSpeakers.parseAsync(res.data);
		},
	});

	if (speakersQuery.isError) {
		return (
			<SpeakerShell>
				<ErrorBox message="Failed to load speakers. Refresh the page and try again." />
			</SpeakerShell>
		);
	}

	if (speakersQuery.isPending) {
		return (
			<SpeakerShell>
				<Loading vertical />
			</SpeakerShell>
		);
	}

	const speakers = speakersQuery.data?.items ?? [];
	const speakerCards = speakers.map(speaker => (
		<SpeakerCard key={speaker.id} speaker={speaker} />
	));
	return (
		<MainLayout title="Speakers">
			{speakerCards.length === 0 ? (
				<div className="Speakers-empty">
					<InfoBanner message="No speakers match the selected filters." />
				</div>
			) : (
				<div className="Speakers-grid">{speakerCards}</div>
			)}

			<Pagination
				pageInfo={speakersQuery.data}
				onPageChange={setPage}
				isLoading={speakersQuery.isLoading}
			/>
		</MainLayout>
	);
}

// biome-ignore lint/complexity/noBannedTypes: we actually need an empty object here
export function SpeakerShell({ children }: React.PropsWithChildren<{}>) {
	return <MainLayout title="Speakers">{children}</MainLayout>;
}
