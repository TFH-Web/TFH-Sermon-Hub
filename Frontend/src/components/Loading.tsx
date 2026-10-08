import clsx from 'clsx';
import './Loading.css';
import { Icon } from '@iconify-icon/react';

export interface LoadingProps {
	vertical?: boolean;
}

export default function Loading({ vertical = false }: LoadingProps) {
	return (
		<h2 className={clsx('Loading', vertical && 'is-vertical')}>
			Loading...
			<Icon icon="eos-icons:loading" className="Loading-icon" />
		</h2>
	);
}
