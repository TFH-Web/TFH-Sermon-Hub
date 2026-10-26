import type { Sermon } from '$/types/sermon';
import Tag from './Tag';

type SermonSummaryOriginProps = Pick<Sermon, 'summary' | 'summarySource'>;

// Show the label only when saved metadata confirms an existing AI summary.
export default function SermonSummaryOrigin({
	summary,
	summarySource,
}: SermonSummaryOriginProps) {
	if (!summary?.trim() || summarySource !== 'ai') {
		return null;
	}

	return <Tag variant="blue">AI Generated</Tag>;
}
