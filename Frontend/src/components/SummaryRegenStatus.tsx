import './SummaryRegenStatus.css';
import type { SummaryRegenState } from '$/types/sermon';

interface Props {
	state: SummaryRegenState | undefined;
	error?: string | null;
}

// One line under the Summary heading that says where "Regenerate with AI" is. Shows nothing when there is nothing to say.
export default function SummaryRegenStatus({ state, error }: Props) {
	if (state === 'queued') {
		return (
			<p className="SummaryRegenStatus" role="status">
				Waiting to write a new summary...
			</p>
		);
	}
	if (state === 'running') {
		return (
			<p className="SummaryRegenStatus" role="status">
				Writing a new summary...
			</p>
		);
	}
	if (state === 'failed') {
		return (
			<p className="SummaryRegenStatus SummaryRegenStatus--failed" role="alert">
				The last attempt failed{error ? `: ${error}` : '.'}
			</p>
		);
	}
	return null;
}
