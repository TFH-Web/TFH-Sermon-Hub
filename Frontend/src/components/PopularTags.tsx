import './PopularTags.css';

const tags = [
	{ name: 'faith',      count: 342 },
	{ name: 'hope',       count: 289 },
	{ name: 'grace',      count: 276 },
	{ name: 'healing',    count: 198 },
	{ name: 'prayer',     count: 187 },
	{ name: 'anxiety',    count: 156 },
	{ name: 'love',       count: 149 },
	{ name: 'worship',    count: 134 },
	{ name: 'family',     count: 121 },
	{ name: 'leadership', count: 98  },
];

export default function PopularTags() {
	return (
		<div className="PopularTags">
			<h2 className="PopularTags-title">Popular Tags</h2>
			<div className="PopularTags-list">
				{tags.map((tag) => (
					<span key={tag.name} className="PopularTags-pill">
						{tag.name} ({tag.count})
					</span>
				))}
			</div>
		</div>
	);
}
