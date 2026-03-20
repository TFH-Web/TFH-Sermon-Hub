import './ProgressBar.css';

export interface ProgressBarProps {
	percent: number;
	width?: string;
}

export default function ProgressBar({ percent, width }: ProgressBarProps) {
	return (
		<div className="ProgressBar" style={{ width }}>
			<div className="ProgressBar-fill" style={{ width: `${percent}%` }} />
		</div>
	);
}
