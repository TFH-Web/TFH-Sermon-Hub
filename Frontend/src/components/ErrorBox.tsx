interface ErrorBoxProps {
	message?: string;
}

// Shared message displayed when a request fails.
export default function ErrorBox({ message }: ErrorBoxProps) {
	return (
		<div role="alert" className="ErrorBox">
			<h2>Error!</h2>
			{message && <p>{message}</p>}
		</div>
	);
}
