import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api';

const FALLBACK = 'Could not do that. Try again.';

// An error as axios raises it when the server answers with a failure status.
function failedWith(data: unknown, status = 400): AxiosError {
	const response = {
		data,
		status,
		statusText: '',
		headers: {},
		config: {},
	} as AxiosResponse;
	return new AxiosError(
		'Request failed',
		AxiosError.ERR_BAD_REQUEST,
		undefined,
		undefined,
		response,
	);
}

describe('apiErrorMessage', () => {
	it('returns the message the endpoint sent', () => {
		const error = failedWith(
			{ error: 'Video is too long', message: 'Video is too long' },
			422,
		);
		expect(apiErrorMessage(error, FALLBACK)).toBe('Video is too long');
	});

	it('prefers "message" over "error" when they differ', () => {
		const error = failedWith({ error: 'short', message: 'the full reason' });
		expect(apiErrorMessage(error, FALLBACK)).toBe('the full reason');
	});

	it('uses "error" when that is all there is, as auth failures send', () => {
		const error = failedWith(
			{ error: 'Access Denied. Required role: Admin' },
			403,
		);
		expect(apiErrorMessage(error, FALLBACK)).toBe(
			'Access Denied. Required role: Admin',
		);
	});

	it('uses "error" when "message" is empty', () => {
		const error = failedWith({ error: 'the reason', message: '' });
		expect(apiErrorMessage(error, FALLBACK)).toBe('the reason');
	});

	it('falls back when the server could not be reached', () => {
		const error = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
		expect(apiErrorMessage(error, FALLBACK)).toBe(FALLBACK);
	});

	it.each([
		['an HTML error page', '<html>Bad Gateway</html>'],
		['an empty object', {}],
		['a message that is not text', { message: 42 }],
		['nothing', null],
	])('falls back when the body is %s', (_name, data) => {
		expect(apiErrorMessage(failedWith(data, 502), FALLBACK)).toBe(FALLBACK);
	});

	it.each([
		['a plain Error', new Error('boom')],
		['a string', 'boom'],
		['undefined', undefined],
	])('falls back for %s, which is not an axios error', (_name, error) => {
		expect(apiErrorMessage(error, FALLBACK)).toBe(FALLBACK);
	});
});
