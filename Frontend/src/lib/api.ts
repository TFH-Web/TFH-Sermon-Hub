import axios from 'axios';
import z from 'zod';

// Endpoint errors send both keys with the same text; auth errors (401, 403) send only "error".
const ErrorBody = z.object({
	message: z.string().nullish(),
	error: z.string().nullish(),
});

/** Return the reason the API gave for a failed request, or fallback when it gave none, e.g. the server could not be reached. */
export function apiErrorMessage(error: unknown, fallback: string): string {
	if (!axios.isAxiosError(error)) return fallback;

	const body = ErrorBody.safeParse(error.response?.data);
	if (!body.success) return fallback;
	return body.data.message || body.data.error || fallback;
}
