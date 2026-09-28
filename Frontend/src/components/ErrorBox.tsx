import './ErrorBox.css';
import { Icon } from '@iconify-icon/react';
import Button from './Button';

export interface ErrorBoxProps {
	// What went wrong, in words the user understands. Leave it out to show only the "Error!" title.
	message?: string;
	// Optional. Pass it and you get a Retry button, skip it and you don't.
	// Most of the time this is just () => query.refetch().]
	onRetry?: () => void;
}

// Use this for any page that fails to load its data.
// Don't write static <h1>Error!</h1>, that's how we ended up with every page failing differently.
export default function ErrorBox({ message, onRetry }: ErrorBoxProps) {
	return (
		// role = "alert" so screen readers actually say something when this shows up
		<div className="ErrorBox" role="alert">
			<h2 className="ErrorBox-title">Error!</h2>
			<Icon className="ErrorBox-icon" icon="lucide:alert-triangle" />
			{message && <p className="ErrorBox-message">{message}</p>}
			{/* Had no onRetry, no button. Same idea as Retry in StatCard. */}
			{onRetry && (
				<Button
					variant="secondary"
					size="sm"
					className="ErrorBox-retry"
					onClick={onRetry}
				>
					Retry
				</Button>
			)}
		</div>
	);
}
