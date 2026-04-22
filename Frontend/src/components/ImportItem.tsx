import type React from 'react';
import './ImportItem.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import ProgressBar from './ProgressBar';
import './ImportActivity.css';
import type { ImportJob } from '$/types/import';

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
	const iconName =
		job.status === 'failed'
			? 'lucide:alert-triangle'
			: (iconMap[job.icon] ?? 'lucide:file');

	const icon = (
		<Icon
			icon={iconName}
			width={20}
			className={job.status === 'failed' ? 'ImportActivity-iconFailed' : ''}
		/>
	);

	const action = <Action {...job} />;

	return (
		<div className={clsx('ImportItem', className)}>
			<div className="ImportItem-icon">{icon}</div>
			<div className="ImportItem-info">
				<div className="ImportItem-title">{job.title}</div>
				<div className="ImportItem-subtitle">{job.subtitle}</div>
			</div>
			{action && <div className="ImportItem-action">{action}</div>}
		</div>
	);
}

function Action({
	status,
	progress,
	subtitle,
}: ImportJob): React.ReactNode | null {
	if (status === 'active' && progress != null) {
		return (
			<div className="ImportActivity-progressWrap">
				<ProgressBar percent={progress} width="100px" />
				<span className="ImportActivity-pct">{progress}%</span>
			</div>
		);
	} else if (status === 'complete') {
		return (
			<span className="ImportActivity-badge ImportActivity-badge--complete">
				Complete
			</span>
		);
	} else if (status === 'failed') {
		// Extract leading number from subtitle (e.g. "12 videos failed")
		const match = subtitle.match(/\d+/);
		const count = match ? match[0] : '';
		return (
			<span className="ImportActivity-badge ImportActivity-badge--failed">
				{count} Errors
			</span>
		);
	} else {
		return null;
	}
}
