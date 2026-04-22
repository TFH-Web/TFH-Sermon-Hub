import './PopularTags.css';
import { tags } from '$/data/tags';
import Container from './Container';

export default function PopularTags() {
	return (
		<Container className="PopularTags">
			<h3 className="PopularTags-title">Popular Tags</h3>
			<div className="PopularTags-list">
				{tags.map(tag => (
					<a
						key={tag.name}
						href={`/tags?tag=${tag.name}`}
						className="PopularTags-pill u-button"
					>
						{tag.name} ({tag.count})
					</a>
				))}
			</div>
		</Container>
	);
}
