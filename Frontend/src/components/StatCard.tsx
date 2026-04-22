import Container from './Container';
import './StatCard.css';

type StatCardProps = {
	label: string;
	value: number;
	trend?: string;
};

function StatCard({ label, value, trend }: StatCardProps) {
	return (
		<Container className="StatCard">
			<h2 className="StatCard-label">{label}</h2>
			<p className="StatCard-value">{value.toLocaleString('en-US')}</p>
			{trend && <p className="StatCard-trend">↑ {trend}</p>}
		</Container>
	);
}

export default StatCard;
