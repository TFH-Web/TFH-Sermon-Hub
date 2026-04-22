import './PopularTags.css';
import { tags } from '$/data/tags';
import Container from './Container';
import Tag from './Tag';

export default function PopularTags() {
	return (
		<Container className="PopularTags">
			<h3 className="PopularTags-title">Popular Tags</h3>
			<div className="PopularTags-list">
				{tags.map(tag => (
					<Tag
						as="a"
						variant="solid"
						key={tag.name}
						href={`/tags?tag=${tag.name}`}
						className="PopularTags-tag u-button"
					>
						{tag.name} ({tag.count})
					</Tag>
				))}
			</div>
		</Container>
	);
}
