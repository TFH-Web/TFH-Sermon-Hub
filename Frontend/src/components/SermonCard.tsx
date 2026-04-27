import './SermonCard.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import {
	createOverlayInfo,
	durationToDateTime,
	durationToString,
	linkTo,
	type Sermon,
} from '$/types/sermon';
import Container from './Container';
import Tag from './Tag';

export interface SermonCardProps {
	sermon: Sermon;
	className?: string;
}

export default function SermonCard({ className, sermon }: SermonCardProps) {
	const overlayInfo = createOverlayInfo(sermon.status);

	return (
		<Container
			className={clsx('SermonCard u-button', className)}
			as="a"
			href={linkTo(sermon)}
		>
			<h3 className="SermonCard-title">{sermon.title}</h3>

			<div className="SermonCard-info">
				<p className="SermonCard-speaker">{sermon.speaker}</p>
				<time className="SermonCard-date" dateTime={sermon.date.toISOString()}>
					{formatDate(sermon.date)}
				</time>
			</div>

			<div className="SermonCard-thumbnail">
				{/* Placeholder for sermon thumbnail, could be an <img> tag with sermon.thumbnailUrl in the future */}
				<img
					className="SermonCard-thumbnailImage"
					src={`https://unsplash.it/seed/${sermon.title}/1280/720`}
					alt={`${sermon.title} thumbnail`}
				/>
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
				{sermon.tags.map(tag => (
					<Tag key={tag} variant="solid">
						{tag}
					</Tag>
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
