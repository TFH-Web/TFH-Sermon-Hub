// Read a source timestamp as seconds, including fractional seconds.
export function parseSourceTimestamp(value: string | null): number | null {
	// Ignore missing values and anything other than a plain positive number.
	if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) {
		return null;
	}

	const seconds = Number(value);

	// Reject numbers that cannot be represented safely.
	if (!Number.isFinite(seconds) || seconds > Number.MAX_SAFE_INTEGER) {
		return null;
	}

	return seconds;
}
