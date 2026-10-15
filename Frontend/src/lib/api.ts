import axios from 'axios';
import z from 'zod';

// Endpoint errors send both keys with the same text; auth errors (401, 403) send only "error".
// Field-validation failures (422) instead send a generic "message" plus a per-field "errors" map.
const ErrorBody = z.object({
	message: z.string().nullish(),
	error: z.string().nullish(),
	errors: z.record(z.string(), z.array(z.string())).nullish(),
});

/** Return the reason the API gave for a failed request, or fallback when it gave none, e.g. the server could not be reached. */
export function apiErrorMessage(error: unknown, fallback: string): string {
	if (!axios.isAxiosError(error)) return fallback;

	const body = ErrorBody.safeParse(error.response?.data);
	if (!body.success) return fallback;

	// A field error is always more specific than the generic "Validation failed" message that comes with it.
	const fieldError = Object.values(body.data.errors ?? {})[0]?.[0];
	return fieldError || body.data.message || body.data.error || fallback;
}
