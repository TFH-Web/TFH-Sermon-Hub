import { describe, expect, it } from 'vitest';
import { parseSourceTimestamp } from './sourceTimestamp';

describe('parseSourceTimestamp', () => {
	// Keep zero and fractional timestamps unchanged.
	it.each([
		['0', 0],
		['30', 30],
		['30.5', 30.5],
		['1.25', 1.25],
	])('reads %s seconds', (value, expected) => {
		expect(parseSourceTimestamp(value)).toBe(expected);
	});

	// Invalid URL values should not become seek requests.
	it.each([
		null,
		'',
		'-1',
		'NaN',
		'Infinity',
		'hello',
		'30s',
		'1:30',
		'0x10',
		'1e3',
		' 30 ',
		'9007199254740992',
	])('ignores invalid timestamp %j', value => {
		expect(parseSourceTimestamp(value)).toBeNull();
	});
});
