import './SearchBar.css';

interface SearchBarProps {
	query: string;
	onQueryChange: (value: string) => void;
}

export default function SearchBar({ query, onQueryChange }: SearchBarProps) {
	return (
		<div className="SearchBar">
			<input
				type="text"
				placeholder="e.g. What has Dave said about overcoming anxiety?"
				value={query}
				onChange={e => onQueryChange(e.target.value)}
				className="SearchBar-input"
			/>
			<button type="submit" className="SearchBar-button">
				Search
			</button>
		</div>
	);
}
