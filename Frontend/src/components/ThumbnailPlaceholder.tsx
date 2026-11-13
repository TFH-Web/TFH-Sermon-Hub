import './ThumbnailPlaceholder.css';
import { Icon } from '@iconify-icon/react';
import clsx from 'clsx';

export interface ThumbnailPlaceholderProps {
	label: string;
	className?: string;
}

// Stands in for a thumbnail when there is no valid YouTube video, instead of an unrelated stock image.
export default function ThumbnailPlaceholder({
	label,
	className,
}: ThumbnailPlaceholderProps) {
	return (
		<div
			className={clsx('ThumbnailPlaceholder', className)}
			role="img"
			aria-label={label}
		>
			<Icon icon="lucide:video" />
		</div>
	);
}
