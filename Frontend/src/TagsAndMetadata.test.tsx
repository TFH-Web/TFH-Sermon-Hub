// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '$/lib/auth';
import TagsAndMetadata from './TagsAndMetadata';

vi.mock('@iconify-icon/react', () => ({ Icon: () => null }));
// The real layout brings in the sidebar and MSAL, none of which this page needs.
vi.mock('$/components/MainLayout', () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// The three modals have their own tests (AddTagModal.test.tsx, TagMutations.test.tsx).
// Here they are stubs, so only the page's wiring is checked: which one opens, and for which tag.
vi.mock('$/modals/AddTagModal', () => ({
	default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
		isOpen ? (
			<div role="dialog" aria-label="Add tag">
				<button type="button" onClick={onClose}>
					Close add
				</button>
			</div>
		) : null,
}));
vi.mock('$/modals/EditTagModal', () => ({
	default: ({
		isOpen,
		onClose,
		tag,
	}: {
		isOpen: boolean;
		onClose: () => void;
		tag: { name: string } | null;
	}) =>
		isOpen ? (
			<div role="dialog" aria-label="Edit tag">
				{tag?.name}
				<button type="button" onClick={onClose}>
					Close edit
				</button>
			</div>
		) : null,
}));
vi.mock('$/modals/DeleteTagModal', () => ({
	default: ({
		isOpen,
		onClose,
		tag,
	}: {
		isOpen: boolean;
		onClose: () => void;
		tag: { name: string } | null;
	}) =>
		isOpen ? (
			<div role="dialog" aria-label="Delete tag">
				{tag?.name}
				<button type="button" onClick={onClose}>
					Close delete
				</button>
			</div>
		) : null,
}));

const originalAdapter = axios.defaults.adapter;
const adapter = vi.fn<AxiosAdapter>();
let queryClient: QueryClient;

// What the fake server knows. Tests may change these before rendering.
let items: unknown[];
let totalPages: number;
let failing: boolean;

function signInAs(roles: string[]) {
	useAuth.setState({ status: 'ready', account: null, roles, message: null });
}

beforeEach(() => {
	failing = false;
	totalPages = 1;
	items = [
		{ name: 'faith', source: 'manual', count: 3 },
		{ name: 'hope', source: 'ai', count: 1 },
	];
	signInAs([]);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	adapter.mockReset();
	adapter.mockImplementation(async config => {
		const response = {
			data: {
				items,
				page: config.params.page,
				pageSize: 5,
				total: items.length,
				totalPages,
			},
			status: failing ? 500 : 200,
			statusText: '',
			headers: {},
			config,
		};
		if (failing) {
			throw new AxiosError(
				'Request failed',
				'ERR_BAD_RESPONSE',
				config,
				undefined,
				response,
			);
		}
		return response;
	});
	axios.defaults.adapter = adapter;
});

afterEach(() => {
	cleanup();
	queryClient.clear();
	axios.defaults.adapter = originalAdapter;
});

function renderPage() {
	return render(
		<QueryClientProvider client={queryClient}>
			<TagsAndMetadata />
		</QueryClientProvider>,
	);
}

const addButton = () =>
	screen.getByRole('button', { name: '+ Add Tag' }) as HTMLButtonElement;
const editButtons = () =>
	screen.getAllByRole('button', { name: 'Edit' }) as HTMLButtonElement[];
const deleteButtons = () =>
	screen.getAllByRole('button', { name: 'Delete' }) as HTMLButtonElement[];

describe('TagsAndMetadata page: the table', () => {
	it('shows loading, then a row per tag with count and source', async () => {
		const { container } = renderPage();
		expect(screen.getByText('Loading...')).toBeTruthy();

		await screen.findByText('faith');

		const rows = Array.from(container.querySelectorAll('tbody tr')).map(row =>
			Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent),
		);
		expect(rows).toEqual([
			['faith', '3', '—', 'Manual', 'EditDelete'],
			['hope', '1', '—', 'AI', 'EditDelete'],
		]);
		expect(screen.queryByText('Loading...')).toBeNull();
		expect(screen.queryByText('No tags yet.')).toBeNull();
	});

	it('asks for the first page of five tags', async () => {
		renderPage();
		await screen.findByText('faith');

		expect(adapter).toHaveBeenCalledOnce();
		const config = adapter.mock.calls[0][0];
		expect(config.url).toBe('/api/tags');
		expect(config.params).toEqual({ page: 1, pageSize: 5 });
	});

	it('moves to the next page', async () => {
		totalPages = 2;
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('Page 1 of 2');

		await user.click(screen.getByRole('button', { name: 'Next page' }));

		await screen.findByText('Page 2 of 2');
		expect(adapter.mock.calls[1][0].params).toEqual({ page: 2, pageSize: 5 });
	});

	it('says so when there are no tags', async () => {
		items = [];

		const { container } = renderPage();

		await screen.findByText('No tags yet.');
		expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
	});

	it('shows an error, without a Retry button, when the tags fail to load', async () => {
		failing = true;

		renderPage();

		await screen.findByText(
			'Failed to load tags. Refresh the page and try again.',
		);
		expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
	});
});

describe('TagsAndMetadata page: who can change tags', () => {
	it('disables every tag action for someone who is not an admin', async () => {
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('faith');

		expect(addButton().disabled).toBe(true);
		for (const button of [...editButtons(), ...deleteButtons()]) {
			expect(button.disabled).toBe(true);
		}
		await user.click(addButton());
		await user.click(editButtons()[0]);
		await user.click(deleteButtons()[0]);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('enables every tag action for an admin', async () => {
		signInAs(['Admin']);
		renderPage();
		await screen.findByText('faith');

		expect(addButton().disabled).toBe(false);
		for (const button of [...editButtons(), ...deleteButtons()]) {
			expect(button.disabled).toBe(false);
		}
	});

	it('opens the add dialog for an admin and closes it again', async () => {
		signInAs(['Admin']);
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('faith');

		await user.click(addButton());
		expect(screen.getByRole('dialog', { name: 'Add tag' })).toBeTruthy();

		await user.click(screen.getByRole('button', { name: 'Close add' }));
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('opens the edit dialog for the tag on the clicked row', async () => {
		signInAs(['Admin']);
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('faith');

		await user.click(editButtons()[1]);

		expect(
			screen.getByRole('dialog', { name: 'Edit tag' }).textContent,
		).toContain('hope');
		expect(screen.queryByRole('dialog', { name: 'Delete tag' })).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Close edit' }));
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('opens the delete dialog for the tag on the clicked row', async () => {
		signInAs(['Admin']);
		const user = userEvent.setup();
		renderPage();
		await screen.findByText('faith');

		await user.click(deleteButtons()[0]);

		expect(
			screen.getByRole('dialog', { name: 'Delete tag' }).textContent,
		).toContain('faith');
		expect(screen.queryByRole('dialog', { name: 'Edit tag' })).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Close delete' }));
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});
