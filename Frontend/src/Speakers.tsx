import { useQuery } from '@tanstack/react-query';
import MurmurHash3 from 'imurmurhash';
import SpeakerCard from './components/SpeakerCard';
import './Speakers.css';
import MainLayout from '$/components/MainLayout';

/* Temp data no longer utilized, delete if needed
// temporary dummy data just for testing displaying speakers
const speakers = [
	{
		name: 'Dave Patterson',
		role: 'Lead Pastor',
		sermoncount: '8',
		color: 'green',
		id: '1',
	},
	{
		name: 'Jon Laurenzo',
		role: 'Guest Speaker',
		sermoncount: '1',
		color: 'blue',
		id: '2',
	},
	{
		name: 'Hilary Harris',
		role: 'Guest Speaker',
		sermoncount: '1',
		color: 'orange',
		id: '3',
	},
];
*/ // Fetch Data
type Speaker = {
	id: string;
	firstName: string;
	lastName: string;
	sermoncount: number;
};

type SpeakerCardData = {
	id: string;
	name: string;
	role: string;
	sermoncount: string;
	color: string;
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

// Generate SpeakerCards from Speaker data
function GenSpeakerCard(speakers: Speaker[]): SpeakerCardData[] {
	return speakers.map(speaker => {
		//Combine first and last name
		const fullName = `${speaker.firstName} ${speaker.lastName}`;

		// Same hashing approach as userHue() in user.ts
		const digest = speaker.id + fullName;
		const hue = MurmurHash3(digest).result() % 360;

		return {
			id: speaker.id,
			name: fullName,
			role: 'Speaker',
			sermoncount: String(speaker.sermoncount),
			color: `hsl(${hue}, 70%, 50%)`,
		};
	});
}

// displays grid of SpeakerCard components from given list of speakers
export default function Speakers() {
	// Fetch speakers using React Query
	const { data: speakers, isLoading, error } = useSpeakers();
	// Loading, error, and empty states, and rendering the speaker cards
	if (isLoading) {
		return (
			<MainLayout title="Speakers">
				<div className="speaker-grid">Loading speakers...</div>
			</MainLayout>
		);
	}

	if (error) {
		return (
			<MainLayout title="Speakers">
				<div className="speaker-grid">Unable to load speakers.</div>
			</MainLayout>
		);
	}

	if (!speakers || speakers.length === 0) {
		return (
			<MainLayout title="Speakers">
				<div className="speaker-grid">No speakers found.</div>
			</MainLayout>
		);
	}

	const speakerCards = GenSpeakerCard(speakers);

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
