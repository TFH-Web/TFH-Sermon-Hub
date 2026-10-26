// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DeleteTagModal from './DeleteTagModal';
import EditTagModal from './EditTagModal';

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
		defaultOptions: { mutations: { retry: false } },
	});
	adapter = vi.fn<AxiosAdapter>(async config => ({
		data: {},
		status: config.method === 'delete' ? 204 : 200,
		statusText: 'OK',
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

function modal(kind: 'rename' | 'delete', name: string) {
	const onClose = vi.fn();
	const tag = { name, source: 'manual' as const, count: 1 };
	render(
		<QueryClientProvider client={queryClient}>
			{kind === 'rename' ? (
				<EditTagModal isOpen onClose={onClose} tag={tag} />
			) : (
				<DeleteTagModal isOpen onClose={onClose} tag={tag} />
			)}
		</QueryClientProvider>,
	);
	return onClose;
}

const names = [
	'/faith//grace/',
	'.',
	'..',
	'hope?why#x&love=1+2%',
	'literal%2Fslash',
];

it.each(
	names,
)('renames %s without putting its identifier in the URL path', async name => {
	const onClose = modal('rename', name);
	const user = userEvent.setup();
	const input = screen.getByPlaceholderText('e.g. forgiveness');
	await user.clear(input);
	await user.type(input, '  renewed / hope  ');
	await user.click(screen.getByRole('button', { name: /^Save$/ }));
	await waitFor(() => expect(onClose).toHaveBeenCalledOnce());

	expect(adapter).toHaveBeenCalledOnce();
	const config = adapter.mock.calls[0][0];
	const url = new URL(axios.getUri(config), 'https://app.example.invalid');
	expect(config.method).toBe('patch');
	expect(url.pathname).toBe('/api/tags');
	expect(url.searchParams.get('name')).toBe(name);
	expect(JSON.parse(config.data)).toEqual({ newName: 'renewed / hope' });
	expect(showToast).toHaveBeenCalledWith('Tag renamed', 'success');
});

it.each(
	names,
)('deletes %s without putting its identifier in the URL path', async name => {
	const onClose = modal('delete', name);
	await userEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
	await waitFor(() => expect(onClose).toHaveBeenCalledOnce());

	expect(adapter).toHaveBeenCalledOnce();
	const config = adapter.mock.calls[0][0];
	const url = new URL(axios.getUri(config), 'https://app.example.invalid');
	expect(config.method).toBe('delete');
	expect(url.pathname).toBe('/api/tags');
	expect(url.searchParams.get('name')).toBe(name);
	expect(showToast).toHaveBeenCalledWith('Tag deleted', 'success');
});

it('keeps rename validation visible and the requested name intact on failure', async () => {
	adapter.mockImplementation(async config => {
		throw new AxiosError(
			'Validation failed',
			'ERR_BAD_REQUEST',
			config,
			undefined,
			{
				config,
				data: {
					message: 'Validation failed',
					errors: { newName: ['Already exists'] },
				},
				status: 422,
				statusText: 'Unprocessable Entity',
				headers: {},
			},
		);
	});
	const onClose = modal('rename', '/faith/grace');
	const user = userEvent.setup();
	const input = screen.getByPlaceholderText('e.g. forgiveness');
	await user.clear(input);
	await user.type(input, 'still editing');
	await user.click(screen.getByRole('button', { name: /^Save$/ }));

	await screen.findByText('Already exists');
	expect((input as HTMLInputElement).value).toBe('still editing');
	expect(onClose).not.toHaveBeenCalled();
});
