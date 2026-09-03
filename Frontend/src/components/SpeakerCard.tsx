import {
	type CountedSpeaker,
	getInitials,
	speakerHue,
	getFullName,
} from '$/types/speaker';
import './SpeakerCard.css';

interface SpeakerCardProps {
	speaker: CountedSpeaker;
}

//speaker card that displays icon with initials, name, role, and amount of sermons recorded in our system
export default function SpeakerCard({ speaker }: SpeakerCardProps) {
	return (
		<div className="speaker-card">
			{/* speaker icon should go here, defaults to colored circle with initials if no icon
			 */}
			<div
				className="speaker-icon"
				style={{ '--h': speakerHue(speaker) } as React.CSSProperties}
			>
				<b>{getInitials(speaker)}</b>
			</div>

			{/* speaker info section with Name header, role, and sermon count*/}
			<div className="speaker-name">
				<p>
					<b>{getFullName(speaker)}</b>
				</p>
			</div>
			<div className="speaker-info">
				<p>
					{speaker.role} • {speaker.sermonCount} sermon
					{speaker.sermonCount !== 1 && 's'}
				</p>
			</div>
		</div>
	);
}
