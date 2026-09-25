import { useQuery } from '@tanstack/react-query';
import SpeakerCard from './components/SpeakerCard';
import './Speakers.css';
import MainLayout from '$/components/MainLayout';

// Fetch Data
type Speaker = {
	id: number;
	firstName: string;
	lastName: string;
};

type Sermon = {
	speaker: { id: number };
};

type SpeakerCardData = {
	id: number;
	firstName: string;
	lastName: string;
	role: string;
	sermonCount: number;
};

// Fetch speakers from the API
function useSpeakers() {
	return useQuery<Speaker[]>({
		queryKey: ['speakers'],
		queryFn: async () => {
			const response = await fetch('/api/speakers');
			if (!response.ok) throw new Error('Network response was not ok');
			return response.json();
		},
	});
}

// Fetch Sermons from the API
function useSermons() {
	return useQuery<Sermon[]>({
		queryKey: ['sermons'],
		queryFn: async () => {
			const response = await fetch('/api/sermons');
			if (!response.ok) throw new Error('Network response was not ok');
			return response.json();
		},
	});
}

// Generate SpeakerCards from Speaker data
function GenSpeakerCard(
	speakers: Speaker[],
	sermons: Sermon[],
): SpeakerCardData[] {
	return speakers.map(speaker => {
		// Count sermons belonging to this speaker
		const count = sermons.filter(
			sermon => sermon.speaker.id === speaker.id,
		).length;

		return {
			id: speaker.id,
			firstName: speaker.firstName,
			lastName: speaker.lastName,
			role: 'Speaker',
			sermonCount: count,
		};
	});
}

// displays grid of SpeakerCard components from given list of speakers
export default function Speakers() {
	// Fetch speakers using React Query
	const {
		data: speakers,
		isLoading: speakersLoading,
		error: speakersError,
	} = useSpeakers();
	const {
		data: sermons,
		isLoading: sermonsLoading,
		error: sermonsError,
	} = useSermons();
	// Loading
	if (speakersLoading) {
		return (
			<MainLayout title="Speakers">
				<div className="speaker-grid">Loading speakers</div>
			</MainLayout>
		);
	}
	if (sermonsLoading) {
		return (
			<MainLayout title="Speakers">
				<div className="speaker-grid">Loading sermons</div>
			</MainLayout>
		);
	}

	// Error
	if (speakersError || sermonsError) {
		return (
			<MainLayout title="Speakers">
				<div className="speaker-grid">Unable to load speakers or sermons.</div>
			</MainLayout>
		);
	}

	// Empty States
	if (!speakers || speakers.length === 0) {
		return (
			<MainLayout title="Speakers">
				<div className="speaker-grid">No speakers found.</div>
			</MainLayout>
		);
	}

	// Rendering Speaker Cards
	const speakerCards = GenSpeakerCard(speakers, sermons ?? []);
	return (
		<MainLayout title="Speakers">
			<div className="speaker-grid">
				{speakerCards.map(speaker => (
					<SpeakerCard key={speaker.id} speaker={speaker} />
				))}
			</div>
		</MainLayout>
	);
}
