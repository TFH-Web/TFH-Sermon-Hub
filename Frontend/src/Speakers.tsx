import SpeakerCard from './components/SpeakerCard';
import './Speakers.css';
import MainLayout from '$/components/MainLayout';

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

// displays grid of SpeakerCard components from given list of speakers
export default function Speakers() {
	return (
		<MainLayout title="Speakers">
			<div className="speaker-grid">
				{speakers.map(speaker => (
					<SpeakerCard key={speaker.id} speaker={speaker} />
				))}
			</div>
		</MainLayout>
	);
}
