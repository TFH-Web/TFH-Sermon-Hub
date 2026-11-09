// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NewSeriesModal from './NewSeriesModal';

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
		data: { id: 9, title: 'Brand New' },
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

function renderModal() {
	const onClose = vi.fn();
	const onCreated = vi.fn();
	render(
		<QueryClientProvider client={queryClient}>
			<NewSeriesModal isOpen onClose={onClose} onCreated={onCreated} />
		</QueryClientProvider>,
	);
	return { onClose, onCreated };
}

function failWith(status: number, data: unknown) {
	adapter.mockImplementation(async config => {
		throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, {
			config,
			data,
			status,
			statusText: 'Error',
			headers: {},
		});
	});
}

it('only asks for a series name', () => {
	renderModal();
	expect(screen.getByPlaceholderText('e.g. Live Your Best Life')).toBeTruthy();
	expect(screen.queryByText('Description')).toBeNull();
	expect(screen.queryByText('Start Date')).toBeNull();
	expect(screen.queryByText('Primary Speaker')).toBeNull();
});

it('posts the trimmed title, then closes, refreshes the list and reports success', async () => {
	const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
	const { onClose, onCreated } = renderModal();
	const user = userEvent.setup();

	await user.type(
		screen.getByPlaceholderText('e.g. Live Your Best Life'),
		'  Brand New  ',
	);
	await user.click(screen.getByRole('button', { name: 'Create Series' }));
	await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());

	const config = adapter.mock.calls[0][0];
	expect(config.method).toBe('post');
	expect(config.url).toBe('/api/series');
	expect(JSON.parse(config.data)).toEqual({ title: 'Brand New' });
	expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
	expect(onClose).toHaveBeenCalledOnce();
	expect(showToast).toHaveBeenCalledWith('Series created', 'success');
});

it('refuses an empty name without calling the server', async () => {
	const { onClose, onCreated } = renderModal();
	await userEvent.click(screen.getByRole('button', { name: 'Create Series' }));

	expect(screen.getByText('Series name is required')).toBeTruthy();
	expect(adapter).not.toHaveBeenCalled();
	expect(onClose).not.toHaveBeenCalled();
	expect(onCreated).not.toHaveBeenCalled();
});

it('tells non-admins only admins can create series and stays open', async () => {
	failWith(403, { message: 'Forbidden' });
	const { onClose, onCreated } = renderModal();
	const user = userEvent.setup();

	await user.type(screen.getByPlaceholderText('e.g. Live Your Best Life'), 'X');
	await user.click(screen.getByRole('button', { name: 'Create Series' }));

	await screen.findByText('Only admins can create series.');
	expect(onClose).not.toHaveBeenCalled();
	expect(onCreated).not.toHaveBeenCalled();
});
