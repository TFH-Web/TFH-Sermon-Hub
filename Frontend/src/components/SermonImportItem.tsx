// One sermon in the Import page's lists. It uses ImportItem's styles, so it looks like those rows.
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import './ImportItem.css';
import { formatDate } from '$/lib/date';
import { linkTo, type Sermon, type Status } from '$/types/sermon';
import { getFullName } from '$/types/speaker';
import Tag from './Tag';

export default function SermonImportItem({ sermon }: { sermon: Sermon }) {
	const failed = sermon.status === 'Failed';
	// Sermon dates have no time, so format in UTC or the day can slip back one.
	const date = formatDate(sermon.date, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	});

	return (
		<div className="ImportItem">
			<h4 className="ImportItem-title">
				<a href={linkTo(sermon)}>{sermon.title}</a>
			</h4>
			<p className="ImportItem-subtitle">
				{getFullName(sermon.speaker)} • {date}
			</p>
			<Icon
				icon={failed ? 'lucide:alert-triangle' : 'lucide:video'}
				width={20}
				className={clsx('ImportItem-icon', failed && 'ImportItem-icon--failed')}
			/>
			<div className="ImportItem-action">
				<StatusBadge status={sermon.status} />
			</div>
		</div>
	);
}

function StatusBadge({ status }: { status: Status }) {
	switch (status) {
		case 'Processing':
			return (
				<Tag variant="amber" className="Action-badge">
					Processing
				</Tag>
			);
		case 'Published':
			return (
				<Tag variant="green" className="Action-badge Action-badge--complete">
					Complete
				</Tag>
			);
		case 'Failed':
			return (
				<Tag variant="red" className="Action-badge Action-badge--failed">
					Failed
				</Tag>
			);
		default:
			// Drafts are not listed on the Import page.
			return null;
	}
}
