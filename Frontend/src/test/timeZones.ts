import process from 'node:process';
import { afterEach } from 'vitest';

// Behind UTC, UTC itself, and the furthest zone ahead of it (UTC+14).
export const ZONES = ['America/Los_Angeles', 'UTC', 'Pacific/Kiritimati'];

/** Run before the sermon is built and rendered, since a date is read in the zone that is set at that moment. */
export function setTimeZone(zone: string) {
	process.env.TZ = zone;
}

/** Call once at the top of a test file so a test that sets the zone does not leak it into the next one. */
export function restoreTimeZoneAfterEach() {
	const original = process.env.TZ;
	afterEach(() => {
		if (original === undefined) delete process.env.TZ;
		else process.env.TZ = original;
	});
}
