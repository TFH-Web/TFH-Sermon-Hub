import { Icon } from '@iconify-icon/react';
import type React from 'react';
import { dashboardImports } from '../data/imports';
import ImportItem from './ImportItem';
import ProgressBar from './ProgressBar';
import './ImportActivity.css';

// Maps icon string from data to an iconify icon name
const iconMap: Record<string, string> = {
	youtube: 'lucide:video',
	file: 'lucide:file-text',
	video: 'lucide:video',
};

export default function ImportActivity() {
	return (
		<div className="ImportActivity">
			<h2 className="ImportActivity-title">Import Activity</h2>

			{dashboardImports.map(job => {
				// Show warning triangle for failed items, otherwise use icon map
				const iconName =
					job.status === 'failed'
						? 'lucide:alert-triangle'
						: (iconMap[job.icon] ?? 'lucide:file');

				const icon = (
					<Icon
						icon={iconName}
						width={20}
						className={
							job.status === 'failed' ? 'ImportActivity-iconFailed' : ''
						}
					/>
				);

				// Action slot changes based on import status
				let action: React.ReactNode = null;

				if (job.status === 'active' && job.progress != null) {
					action = (
						<div className="ImportActivity-progressWrap">
							<ProgressBar percent={job.progress} width="100px" />
							<span className="ImportActivity-pct">{job.progress}%</span>
						</div>
					);
				} else if (job.status === 'complete') {
					action = (
						<span className="ImportActivity-badge ImportActivity-badge--complete">
							Complete
						</span>
					);
				} else if (job.status === 'failed') {
					// Extract leading number from subtitle (e.g. "12 videos failed")
					const match = job.subtitle.match(/\d+/);
					const count = match ? match[0] : '';
					action = (
						<span className="ImportActivity-badge ImportActivity-badge--failed">
							{count} Errors
						</span>
					);
				}

				return (
					<ImportItem
						key={job.id}
						icon={icon}
						title={job.title}
						subtitle={job.subtitle}
						action={action}
					/>
				);
			})}
		</div>
	);
}
