import Button from './Button';
import Container from './Container';
import './StatCard.css';

type StatCardProps = {
	label: string;
	value?: number | string;
	trend?: string;
	caption?: string;
	isLoading?: boolean;
	isError?: boolean;
	onRetry?: () => void;
};

function StatCard({
	label,
	value,
	trend,
	caption,
	isLoading = false,
	isError = false,
	onRetry,
}: StatCardProps) {
	return (
		<Container className="StatCard">
			<h2 className="StatCard-label">{label}</h2>

			{isError ? (
				<div className="StatCard-error">
					<p className="StatCard-errorText">Couldn't load</p>
					{onRetry && (
						<Button variant="secondary" size="sm" onClick={onRetry}>
							Retry
						</Button>
					)}
				</div>
			) : isLoading ? (
				<div
					className="StatCard-skeleton"
					role="status"
					aria-label={`Loading ${label}`}
				/>
			) : (
				<>
					<p className="StatCard-value">{value?.toLocaleString('en-US')}</p>
					{trend && <p className="StatCard-trend">{trend}</p>}
					{caption && <p className="StatCard-caption">{caption}</p>}
				</>
			)}
		</Container>
	);
}

export default StatCard;
