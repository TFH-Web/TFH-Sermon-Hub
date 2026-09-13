<<<<<<< HEAD
=======
// import { useState } from 'react';
import { useQuery } from '@tanstack/react-query'; // React Query for data fetching
>>>>>>> 0a7c1d6 (Fetch the speaker list from the backend and show it)
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
	{
		name: 'Tosha Zwanziger',
		role: 'Guest Speaker',
		sermoncount: '1',
		color: 'green',
		id: '4',
	},
	{
		name: 'Rich Harris',
		role: 'Guest Speaker',
		sermoncount: '1',
		color: 'blue',
		id: '5',
	},
];
*/ // Fetch Data
type Speaker = {
	id: string;
	firstName: string;
	lastName: string;
}

type SpeakerCardData = {
	id: string;
	name: string;
	role: string;
	sermonCount: number;
	color: string;
};
function fetchSpeakers() {
	return useQuery<Speaker[]>({
		queryKey: ['speakers'],
		queryFn: async () => {
			const response = await fetch ('/api/speakers');
			if (!response.ok) 
				throw new Error('Network response was not ok');
			return response.json();
		},
	});
}

function GenSpeakerCard(speakers: Speaker[]): SpeakerCardData[] {
	return speakers.map(speaker => ({
		id: speaker.id,
		name: `${speaker.firstName} ${speaker.lastName}`,
		// Default values that can be replaced by actual data if available
		role: 'Speaker',
		sermonCount: 0,
		color: 'blue',
	}));
}

// displays grid of SpeakerCard components from given list of speakers
export default function Speakers() {
	// Fetch speakers using React Query
	const { data: speakers, isLoading, error } = fetchSpeakers();
	
	if (isLoading) {
		return ( 
			<MainLayout title="Speakers">
				<div>Loading speakers...</div>
			</MainLayout> 
		);
	}
	if (error) {
		return (
			<MainLayout title="Speakers">
				<div>Error loading speakers: {error.message}</div>
			</MainLayout>
		);
	}
	
	const speakerCards = GenSpeakerCard(speakers);

	return (
		<MainLayout title="Speakers">
			<div className="speaker-grid">
<<<<<<< HEAD
				{speakers.map(speaker => (
=======
				{speakerCards.map(speaker => (
>>>>>>> 0a7c1d6 (Fetch the speaker list from the backend and show it)
					<SpeakerCard key={speaker.id} speaker={speaker} />
				))}
			</div>
		</MainLayout>
	);
}
