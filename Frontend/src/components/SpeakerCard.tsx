import type { Speaker } from '../types/speaker';
import './SpeakerCard.css';

interface SpeakerCardProps {
	speaker: Speaker;
}

//function that gets the initals of a given name
function getInitials(name: string): string {
	return name
		.trim() //trims whitespace from front and back
		.split(/\s+/) //makes an array of objects from name, divided by spaces
		.map(part => part[0]) //reduces each part of name to single starting initial
		.join('') //joins initials together
		.toUpperCase(); //capitalizes initials
}

//speaker card that displays icon with initials, name, role, and amount of sermons recorded in our system
export default function SpeakerCard({ speaker }: SpeakerCardProps) {
	return (
		<div className="speaker-card">
			{/* speaker icon should go here, defaults to colored circle with initials if no icon
			 */}
			<div
				className="speaker-icon"
				style={{
					backgroundColor: speaker.color,
				}}
			>
				<b>{getInitials(speaker.name)}</b>
			</div>

			{/* speaker info section with Name header, role, and sermon count*/}
			<div className="speaker-name">
				<p>
					<b>{speaker.name}</b>
				</p>
			</div>
			<div className="speaker-info">
				<p>
					{speaker.role} • {speaker.sermoncount} sermons
				</p>
			</div>
		</div>
	);
}
