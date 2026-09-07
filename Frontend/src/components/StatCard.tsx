import Container from './Container';
import './StatCard.css';

type StatCardProps = {
	label: string;
	value: number | string;
	trend?: string;
	caption?: string;
};

function StatCard({ label, value, trend, caption }: StatCardProps) {
	return (
		<Container className="StatCard">
			<h2 className="StatCard-label">{label}</h2>
			<p className="StatCard-value">{value.toLocaleString('en-US')}</p>
			{trend && <p className="StatCard-trend"> {trend}</p>}
			{caption && <p className="StatCard-caption">{caption}</p>}
		</Container>
	);
}

export default StatCard;
