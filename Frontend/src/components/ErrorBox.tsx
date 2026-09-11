import './ErrorBox.css';
import { Icon } from '@iconify-icon/react';

export interface ErrorBoxProps {
	message?: string;
}

export default function ErrorBox({ message }: ErrorBoxProps) {
	return (
		<div className="ErrorBox">
			<h2 className="ErrorBox-title">Error!</h2>
			<Icon className="ErrorBox-icon" icon="lucide:alert-triangle" />
			{message && <p className="ErrorBox-message">{message}</p>}
		</div>
	);
}
