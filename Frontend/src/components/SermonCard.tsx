import type { Sermon } from '../types/sermon';

interface SermonCardProps {
	sermon: Sermon;
}

export default function SermonCard({ sermon }: SermonCardProps) {
	return (
		<div className="sermon-card">
			{/* Sermon card container with thumbnail, information, and tags */}
			{/* Placeholder for sermon thumbnail, could be an <img> tag with sermon.thumbnailUrl in the future */}
			<div className="sermon-thumbnail">
				{sermon.time && (
					<span className="sermon-time">{sermon.time}</span>
				)}
			</div>

			{/* Sermon information section with title, speaker, date, and tags */}
			<div className="sermon-info">
				<h3>{sermon.title}</h3>
				<p>
					{sermon.speaker} • {sermon.date}{' '}
				</p>
			</div>
			<div className="sermon-tags">
				{sermon.tags.map(tag => (
					<span key={tag} className="tag-pill">
						{tag}
					</span>
				))}
			</div>
		</div>
	);
}
