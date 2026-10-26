import type { Tag as SavedTag } from '$/types/tag';
import Tag from './Tag';

interface SermonTagProps {
	tag: SavedTag;
}

// Label a tag as AI-generated only when its saved source confirms it.
export default function SermonTag({ tag }: SermonTagProps) {
	return (
		<Tag variant="solid">
			{tag.name}
			{tag.source === 'ai' && ' · AI Generated'}
		</Tag>
	);
}
