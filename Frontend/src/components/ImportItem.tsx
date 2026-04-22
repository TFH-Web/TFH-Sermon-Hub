import type React from 'react';
import './ImportItem.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import './ImportActivity.css';
import type { ImportJob } from '$/types/import';
import Tag from './Tag';

// Maps icon string from data to an iconify icon name
const iconMap: Record<string, string> = {
	youtube: 'lucide:video',
	file: 'lucide:file-text',
	video: 'lucide:video',
};

export interface ImportItemProps {
	job: ImportJob;
	className?: string;
}

export default function ImportItem({ job, className }: ImportItemProps) {
	// Show warning triangle for failed items, otherwise use icon map
	const iconName = getIconName(job);

	const action = <Action {...job} />;

	return (
		<div className={clsx('ImportItem', className)}>
			<h4 className="ImportItem-title">{job.title}</h4>
			<p className="ImportItem-subtitle">{job.subtitle}</p>
			<Icon
				icon={iconName}
				width={20}
				className={clsx(
					'ImportItem-icon',
					job.status === 'failed' && 'ImportItem-icon--failed',
				)}
			/>
			{action && <div className="ImportItem-action">{action}</div>}
		</div>
	);
}

function getIconName(job: ImportJob): string {
	if (job.status === 'failed') {
		return 'lucide:alert-triangle';
	} else {
		return iconMap[job.icon] ?? 'lucide:file';
	}
}

function Action({
	status,
	progress,
	subtitle,
}: ImportJob): React.ReactNode | null {
	if (status === 'active' && progress != null) {
		return (
			<label className="Action-progressLabel">
				<progress className="Action-progress" max={100} value={progress} />
				<span className="Action-progressValue">{progress}%</span>
			</label>
		);
	} else if (status === 'complete') {
		return (
			<Tag variant="green" className="Action-badge Action-badge--complete">Complete</Tag>
		);
	} else if (status === 'failed') {
		// Extract leading number from subtitle (e.g. "12 videos failed")
		const match = subtitle.match(/\d+/);
		const count = match ? match[0] : '';
		return (
			<Tag variant="red" className="Action-badge Action-badge--failed">{count} Errors</Tag>
		);
	} else {
		return null;
	}
}
