import { useEffect, useMemo, useRef, useState } from 'react';
import './SearchDateDropdown.css';

interface SearchDateDropdownProps {
	value: string;
	onChange: (value: string) => void;
}

const ALL_DATES_VALUE = 'any';

const dateOptions = [
	{ label: 'All dates', value: ALL_DATES_VALUE },
	{ label: '24 Hours', value: '24h' },
	{ label: '7 Days', value: '7d' },
	{ label: '14 Days', value: '14d' },
	{ label: '28 Days', value: '28d' },
	{ label: '1 Year', value: '1y' },
];

function isCustomValue(value: string) {
	return value.startsWith('custom|');
}

function getTriggerLabel(
	value: string,
	hasPartialCustomRange: boolean,
	hasInvalidCustomRange: boolean,
) {
	if (hasPartialCustomRange || hasInvalidCustomRange) {
		return 'All dates';
	}

	const preset = dateOptions.find(option => option.value === value);

	if (preset) {
		return preset.label;
	}

	if (isCustomValue(value)) {
		return 'Custom range';
	}

	return 'All dates';
}

export default function SearchDateDropdown({
	value,
	onChange,
}: SearchDateDropdownProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [fromDate, setFromDate] = useState('');
	const [toDate, setToDate] = useState('');

	useEffect(() => {
		if (!isCustomValue(value)) {
			setFromDate('');
			setToDate('');
			return;
		}

		const [, from, to] = value.split('|');
		setFromDate(from ?? '');
		setToDate(to ?? '');
	}, [value]);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (!wrapperRef.current) return;

			if (!wrapperRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}

		document.addEventListener('mousedown', handleClickOutside);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	const hasPartialCustomRange =
		(fromDate !== '' && toDate === '') || (fromDate === '' && toDate !== '');

	const hasInvalidCustomRange =
		fromDate !== '' && toDate !== '' && fromDate > toDate;

	const suppressPresetCheckmarks =
		hasPartialCustomRange || hasInvalidCustomRange || isCustomValue(value);

	const triggerLabel = useMemo(
		() => getTriggerLabel(value, hasPartialCustomRange, hasInvalidCustomRange),
		[value, hasPartialCustomRange, hasInvalidCustomRange],
	);

	function handlePresetSelect(nextValue: string) {
		setFromDate('');
		setToDate('');
		onChange(nextValue);
		setIsOpen(false);
	}

	function updateCustomRange(nextFrom: string, nextTo: string) {
		setFromDate(nextFrom);
		setToDate(nextTo);

		const hasBothDates = nextFrom !== '' && nextTo !== '';
		const hasOnlyOneDate =
			(nextFrom !== '' && nextTo === '') || (nextFrom === '' && nextTo !== '');

		if (hasOnlyOneDate) {
			onChange(ALL_DATES_VALUE);
			return;
		}

		if (!hasBothDates) {
			onChange(ALL_DATES_VALUE);
			return;
		}

		if (nextFrom > nextTo) {
			onChange(ALL_DATES_VALUE);
			return;
		}

		onChange(`custom|${nextFrom}|${nextTo}`);
	}

	return (
		<div className="SearchDateDropdown" ref={wrapperRef}>
			<button
				type="button"
				className="SearchDateDropdown-trigger"
				onClick={() => setIsOpen(open => !open)}
				aria-haspopup="dialog"
				aria-expanded={isOpen}
			>
				<span className="SearchDateDropdown-triggerLabel">{triggerLabel}</span>
				<span className="SearchDateDropdown-chevron" aria-hidden="true">
					▼
				</span>
			</button>

			{isOpen && (
				<div className="SearchDateDropdown-panel">
					<div className="SearchDateDropdown-options">
						{dateOptions.map(option => {
							const isActive =
								!suppressPresetCheckmarks && value === option.value;

							return (
								<button
									key={option.value}
									type="button"
									className={`SearchDateDropdown-option ${
										isActive ? 'SearchDateDropdown-option--active' : ''
									}`}
									onClick={() => handlePresetSelect(option.value)}
								>
									<span>{option.label}</span>
									<span className="SearchDateDropdown-check" aria-hidden="true">
										{isActive ? '✓' : ''}
									</span>
								</button>
							);
						})}
					</div>

					<div className="SearchDateDropdown-divider" />

					<div className="SearchDateDropdown-range">
						<div className="SearchDateDropdown-rangeFields">
							<div className="SearchDateDropdown-field">
								<label
									htmlFor="search-date-from"
									className="SearchDateDropdown-label"
								>
									Start date
								</label>
								<input
									id="search-date-from"
									type="date"
									value={fromDate}
									onChange={e => updateCustomRange(e.target.value, toDate)}
									className="SearchDateDropdown-input"
								/>
							</div>

							<div className="SearchDateDropdown-field">
								<label
									htmlFor="search-date-to"
									className="SearchDateDropdown-label"
								>
									End date
								</label>
								<input
									id="search-date-to"
									type="date"
									value={toDate}
									onChange={e => updateCustomRange(fromDate, e.target.value)}
									className="SearchDateDropdown-input"
								/>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
