import './SermonCard.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import { formatCalendarDate, toCalendarDateString } from '$/lib/date';
import { buildYouTubeThumbnailUrl, resolveYouTubeVideoId } from '$/lib/youtube';
import {
	createOverlayInfo,
	durationToDateTime,
	durationToString,
	linkTo,
	type Sermon,
} from '$/types/sermon';
import { getFullName } from '$/types/speaker';
import Container from './Container';
import SermonTag from './SermonTag';
import Tag from './Tag';
import ThumbnailPlaceholder from './ThumbnailPlaceholder';

export interface SermonCardProps {
	sermon: Sermon;
	className?: string;
}

export default function SermonCard({ className, sermon }: SermonCardProps) {
	const overlayInfo = createOverlayInfo(sermon.status);
	const videoId = resolveYouTubeVideoId(sermon);
	const thumbnailUrl = videoId && buildYouTubeThumbnailUrl(videoId);
	const thumbnailLabel = `${sermon.title} thumbnail`;

	return (
		<Container
			className={clsx('SermonCard u-button', className)}
			as="a"
			href={linkTo(sermon)}
		>
			<h3 className="SermonCard-title">{sermon.title}</h3>

			<div className="SermonCard-info">
				<p className="SermonCard-speaker">{getFullName(sermon.speaker)}</p>
				<time
					className="SermonCard-date"
					dateTime={toCalendarDateString(sermon.date)}
				>
					{formatCalendarDate(sermon.date)}
				</time>
			</div>

			<div className="SermonCard-thumbnail">
				{thumbnailUrl ? (
					<img
						className="SermonCard-thumbnailImage"
						src={thumbnailUrl}
						alt={thumbnailLabel}
						loading="lazy"
					/>
				) : (
					<ThumbnailPlaceholder
						className="SermonCard-thumbnailImage"
						label={thumbnailLabel}
					/>
				)}
				<time
					className="SermonCard-duration"
					dateTime={durationToDateTime(sermon.duration)}
				>
					{durationToString(sermon.duration)}
				</time>
				<div
					className="SermonCard-overlay"
					hidden={sermon.status === 'Published'}
				>
					<Tag
						variant={overlayInfo.tagVariant}
						className="SermonCard-overlayTag"
					>
						<Icon icon={overlayInfo.icon} />
						{overlayInfo.text}
					</Tag>
				</div>
			</div>

			<div className="SermonCard-tags">
				{/* Preserve each tag's saved origin when displaying it. */}
				{sermon.tags.map(tag => (
					<SermonTag key={tag.name} tag={tag} />
				))}
			</div>
		</Container>
	);
}
