import './SearchFilters.css';

type ContentType = 'all' | 'sermon' | 'transcript' | 'note';

interface ContentOption {
	label: string;
	value: ContentType;
}

interface SearchFiltersProps {
	contentOptions: ContentOption[];
	type: ContentType;
	onTypeChange: (value: ContentType) => void;
	speaker: string;
	onSpeakerChange: (value: string) => void;
	date: string;
	onDateChange: (value: string) => void;
}

export default function SearchFilters({
	contentOptions,
	type,
	onTypeChange,
	speaker,
	onSpeakerChange,
	date,
	onDateChange,
}: SearchFiltersProps) {
	return (
		<div className="SearchFilters">
			<div className="SearchFilters-pills">
				{contentOptions.map(option => (
					<button
						key={option.value}
						type="button"
						onClick={() => onTypeChange(option.value)}
						className={`SearchFilters-pill ${
							type === option.value ? 'SearchFilters-pill--active' : ''
						}`}
					>
						{option.label}
					</button>
				))}
			</div>

			<select
				value={speaker}
				onChange={e => onSpeakerChange(e.target.value)}
				className="SearchFilters-select"
			>
				<option value="any">Any Speaker</option>
				<option value="Dave">Dave</option>
				<option value="Michael">Michael</option>
				<option value="Tim">Tim</option>
			</select>

			<select
				value={date}
				onChange={e => onDateChange(e.target.value)}
				className="SearchFilters-select"
			>
				<option value="any">Any Date</option>
				<option value="2024">2024</option>
				<option value="2023">2023</option>
				<option value="2022">2022</option>
			</select>
		</div>
	);
}
