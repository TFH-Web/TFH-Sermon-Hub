import SpeakerCard from './components/SpeakerCard';
import './Speakers.css';
import MainLayout from '$/components/MainLayout';
import { speakers } from './data/speakers';

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
