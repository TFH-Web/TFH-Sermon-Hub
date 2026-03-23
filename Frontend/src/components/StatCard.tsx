import './StatCard.css';

type StatCardProps = {
  label: string;
  value: string;
  trend?: string;
};

function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div className="StatCard">
      <p className="StatCard-label">{label}</p>
      <h2 className="StatCard-value">{value}</h2>
      {trend && <p className="StatCard-trend">↑ {trend}</p>}
    </div>
  );
}

export default StatCard;
