import './SermonCard.css';
import {
	durationToDateTime,
	durationToString,
	type Sermon,
} from '$/types/sermon';
import Container from './Container';

export interface SermonCardProps {
	sermon: Sermon;
}

export default function SermonCard({ sermon }: SermonCardProps) {
	return (
		<Container className="SermonCard">
			{/* Sermon card container with thumbnail, information, and tags */}
			{/* Placeholder for sermon thumbnail, could be an <img> tag with sermon.thumbnailUrl in the future */}
			<div className="SermonCard-thumbnail">
				<time
					className="SermonCard-duration"
					dateTime={durationToDateTime(sermon.duration)}
				>
					{durationToString(sermon.duration)}
				</time>
			</div>

			{/* Sermon information section with title, speaker, date, and tags */}
			<div className="SermonCard-info">
				<h3>{sermon.title}</h3>
				<p>
					{sermon.speaker} • {formatDate(sermon.date)}
				</p>
			</div>
			<div className="SermonCard-tags">
				{sermon.tags.map(tag => (
					<span key={tag} className="tag-pill">
						{tag}
					</span>
				))}
			</div>
		</Container>
	);
}

function formatDate(date: Date): string {
	const formatter = Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
	return formatter.format(date);
}
