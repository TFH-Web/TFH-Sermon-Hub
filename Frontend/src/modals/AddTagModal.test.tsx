// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddTagModal from './AddTagModal';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast }),
}));
vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));

const originalAdapter = axios.defaults.adapter;
let queryClient: QueryClient;
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;

beforeEach(() => {
	vi.clearAllMocks();
	queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	adapter = vi.fn<AxiosAdapter>(async config => ({
		data: {},
		status: 201,
		statusText: 'Created',
		headers: {},
		config,
	}));
	axios.defaults.adapter = adapter;
});

afterEach(() => {
	cleanup();
	queryClient.clear();
	axios.defaults.adapter = originalAdapter;
});

function modal() {
	const onClose = vi.fn();
	render(
		<QueryClientProvider client={queryClient}>
			<AddTagModal isOpen onClose={onClose} />
		</QueryClientProvider>,
	);
	return onClose;
}

// Make the next request fail the way the API does: an HTTP error with an optional JSON body.
function failWith(status: number, data: unknown = {}) {
	adapter.mockImplementation(async config => {
		throw new AxiosError(
			'Request failed',
			status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
			config,
			undefined,
			{ config, data, status, statusText: '', headers: {} },
		);
	});
}

const input = () =>
	screen.getByPlaceholderText('e.g. forgiveness') as HTMLInputElement;
const addButton = () =>
	screen.getByRole('button', { name: /^(Add Tag|Adding…)$/ });

describe('AddTagModal', () => {
	it.each([
		'',
		'   ',
	])('asks for a tag and sends nothing when the input is %j', async text => {
		modal();
		const user = userEvent.setup();
		if (text) await user.type(input(), text);

		await user.click(addButton());

		expect(screen.getByText('Tag is required')).toBeTruthy();
		expect(adapter).not.toHaveBeenCalled();
	});

	it('posts the trimmed name, then toasts, clears the input and closes', async () => {
		const onClose = modal();
		const user = userEvent.setup();
		await user.type(input(), '  forgiveness  ');

		await user.click(addButton());

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(adapter).toHaveBeenCalledOnce();
		const config = adapter.mock.calls[0][0];
		expect(config.method).toBe('post');
		expect(config.url).toBe('/api/tags');
		expect(JSON.parse(config.data)).toEqual({ name: 'forgiveness' });
		expect(showToast).toHaveBeenCalledWith('Tag Added', 'success');
		expect(input().value).toBe('');
	});

	it('marks the tag and sermon caches stale after a successful add', async () => {
		modal();
		const user = userEvent.setup();
		// Seed caches that are not being watched, so they are only marked stale, not refetched.
		for (const key of ['tags', 'paginated-tags', 'sermons', 'sermon']) {
			queryClient.setQueryData([key], []);
		}
		await user.type(input(), 'forgiveness');

		await user.click(addButton());

		await waitFor(() => expect(showToast).toHaveBeenCalled());
		for (const key of ['tags', 'paginated-tags', 'sermons', 'sermon']) {
			expect(queryClient.getQueryState([key])?.isInvalidated).toBe(true);
		}
	});

	it('tells a non-admin that only admins can add tags and keeps what they typed', async () => {
		failWith(403, { error: 'Forbidden' });
		const onClose = modal();
		const user = userEvent.setup();
		await user.type(input(), 'forgiveness');

		await user.click(addButton());

		await screen.findByText('Only admins can add tags.');
		expect(onClose).not.toHaveBeenCalled();
		expect(showToast).not.toHaveBeenCalled();
		expect(input().value).toBe('forgiveness');
	});

	it('shows the specific field error from a validation failure', async () => {
		failWith(422, {
			message: 'Validation failed',
			errors: { name: ['Already exists'] },
		});
		modal();
		const user = userEvent.setup();
		await user.type(input(), 'forgiveness');

		await user.click(addButton());

		await screen.findByText('Already exists');
		expect(screen.queryByText('Validation failed')).toBeNull();
	});

	it('falls back to a generic message when the server gives no reason', async () => {
		failWith(500);
		modal();
		const user = userEvent.setup();
		await user.type(input(), 'forgiveness');

		await user.click(addButton());

		await screen.findByText('Could not add the tag. Try again.');
	});

	it('disables the form while the request is in flight', async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>(resolve => {
			release = resolve;
		});
		adapter.mockImplementation(async config => {
			await gate;
			return {
				data: {},
				status: 201,
				statusText: 'Created',
				headers: {},
				config,
			};
		});
		const onClose = modal();
		const user = userEvent.setup();
		await user.type(input(), 'forgiveness');

		await user.click(addButton());

		await waitFor(() => expect(addButton().textContent).toBe('Adding…'));
		expect((addButton() as HTMLButtonElement).disabled).toBe(true);
		expect(addButton().getAttribute('aria-busy')).toBe('true');
		expect(input().disabled).toBe(true);
		release();
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	it('clears the error as soon as the user types again', async () => {
		modal();
		const user = userEvent.setup();
		await user.click(addButton());
		expect(screen.getByText('Tag is required')).toBeTruthy();

		await user.type(input(), 'f');

		expect(screen.queryByText('Tag is required')).toBeNull();
	});

	it('closes without sending anything when Cancel is clicked', async () => {
		const onClose = modal();
		const user = userEvent.setup();

		await user.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onClose).toHaveBeenCalledOnce();
		expect(adapter).not.toHaveBeenCalled();
	});
});
