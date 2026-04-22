import SearchDateDropdown from './SearchDateDropdown';
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
	const selectedSpeakerLabel = speaker === 'any' ? 'Any Speaker' : speaker;
	const speakerWidth = `${Math.max(selectedSpeakerLabel.length - 0.3, 7)}ch`;
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

			<div
				className="SearchFilters-selectWrap"
				style={{ width: speakerWidth }}
			>
				<select
					value={speaker}
					onChange={e => onSpeakerChange(e.target.value)}
					className="SearchFilters-select"
				>
					<option value="any">Any Speaker</option>
					<option value="Dave Patterson">Dave Patterson</option>
					<option value="Jon Laurenzo">Jon Laurenzo</option>
					<option value="Hilary Harris">Hilary Harris</option>
					<option value="Tosha Zwanziger">Tosha Zwanziger</option>
					<option value="Rich Harris">Rich Harris</option>
					<option value="Joseph Zwanziger">Joseph Zwanziger</option>
					<option value="Jake Taylor">Jake Taylor</option>
				</select>

				<span className="SearchFilters-selectArrow" aria-hidden="true">
					▼
				</span>
			</div>

			<SearchDateDropdown value={date} onChange={onDateChange} />
		</div>
	);
}