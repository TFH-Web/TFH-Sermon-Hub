import './UploadZone.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';
import Tag from './Tag';

export interface UploadZoneProps {
	onClick?: () => void;
	className?: string;
}

export default function UploadZone({ onClick, className }: UploadZoneProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: upload zone with complex internal layout
		<div
			className={clsx('UploadZone', className)}
			onClick={onClick}
			onKeyDown={e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onClick?.();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<Icon icon="lucide:upload" width={40} height={40} />
			<h3 className="UploadZone-heading">Upload or import content</h3>
			<p className="UploadZone-text">
				Drag and drop files here, or click to browse
			</p>
			<div className="UploadZone-tags">
				<Tag variant="outline">YouTube Link</Tag>
				<Tag variant="outline">Vimeo Link</Tag>
				<Tag variant="outline">Video File</Tag>
				<Tag variant="outline">Documents</Tag>
			</div>
		</div>
	);
}
