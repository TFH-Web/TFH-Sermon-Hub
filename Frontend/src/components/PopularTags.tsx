import './PopularTags.css';
import { tags } from '$/data/tags';
import Container from './Container';

export default function PopularTags() {
	return (
		<div className="PopularTags">
			<h2 className="PopularTags-title">Popular Tags</h2>
			<div className="PopularTags-list">
				{tags.map(tag => (
					<span key={tag.name} className="PopularTags-pill">
						{tag.name} ({tag.count})
					</span>
				))}
			</div>
		</div>
	);
}
