// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSermon } from '$/test/makeSermon';
import { restoreTimeZoneAfterEach, setTimeZone, ZONES } from '$/test/timeZones';
import EditSermonModal from './EditSermonModal';

vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

restoreTimeZoneAfterEach();
afterEach(cleanup);

describe('EditSermonModal', () => {
	it.each(ZONES)('fills the date field with the saved day in %s', zone => {
		setTimeZone(zone);
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={queryClient}>
				<EditSermonModal
					isOpen
					onClose={vi.fn()}
					sermon={makeSermon({ date: '2026-03-01' })}
				/>
			</QueryClientProvider>,
		);

		// FormField labels are not linked to their inputs, so the field is found by its type.
		const date =
			container.querySelector<HTMLInputElement>('input[type="date"]');
		expect(date?.value).toBe('2026-03-01');
	});
});

// The speakers and series the page passes in. makeSermon's own are speaker 1 and series 1.
const speakers = [
	{ id: 1, firstName: 'Dave', lastName: 'Patterson' },
	{ id: 2, firstName: 'Guest', lastName: 'Speaker' },
];
const series = [
	{ id: 1, title: 'Live Your Best Life' },
	{ id: 2, title: 'Together' },
];

describe('EditSermonModal fields', () => {
	const originalAdapter = axios.defaults.adapter;
	// The body of each save the modal sent.
	let saved: unknown[];

	beforeEach(() => {
		saved = [];
		axios.defaults.adapter = async config => {
			saved.push(JSON.parse(config.data));
			return {
				data: {},
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		};
	});

	afterEach(() => {
		axios.defaults.adapter = originalAdapter;
	});

	function renderModal(
		props: Partial<ComponentProps<typeof EditSermonModal>> = {},
	) {
		const onClose = vi.fn();
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={queryClient}>
				<EditSermonModal
					isOpen
					onClose={onClose}
					sermon={makeSermon()}
					speakers={speakers}
					series={series}
					{...props}
				/>
			</QueryClientProvider>,
		);
		return { onClose };
	}

	const select = (label: string) =>
		screen.getByLabelText(label) as HTMLSelectElement;
	const input = (label: string) =>
		screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
	const options = (label: string) =>
		Array.from(select(label).options).map(o => [o.value, o.textContent]);
	const save = () =>
		userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

	it('offers the speakers and series it is given, by id, with the sermon own selected', () => {
		renderModal();

		expect(options('Speaker')).toEqual([
			['', 'Select speaker'],
			['1', 'Dave Patterson'],
			['2', 'Guest Speaker'],
		]);
		expect(options('Series')).toEqual([
			['', 'Select series'],
			['1', 'Live Your Best Life'],
			['2', 'Together'],
		]);
		expect(select('Speaker').value).toBe('1');
		expect(select('Series').value).toBe('1');
	});

	it('still shows the sermon own speaker and series when the lists do not have them', () => {
		renderModal({ speakers: [], series: [] });

		expect(options('Speaker')).toContainEqual(['1', 'Dave Patterson']);
		expect(select('Speaker').value).toBe('1');
		expect(options('Series')).toContainEqual(['1', 'Live Your Best Life']);
		expect(select('Series').value).toBe('1');
	});

	it('starts with no series selected for a sermon that has none', () => {
		renderModal({ sermon: makeSermon({ series: null }) });

		expect(select('Series').value).toBe('');
	});

	it('prefills the description', () => {
		renderModal();

		expect(input('Description').value).toBe('A message on faith.');
	});

	it('saves the changed speaker, series, date and description', async () => {
		const { onClose } = renderModal();

		fireEvent.change(select('Speaker'), { target: { value: '2' } });
		fireEvent.change(select('Series'), { target: { value: '2' } });
		fireEvent.change(input('Date'), { target: { value: '2026-05-03' } });
		fireEvent.change(input('Description'), { target: { value: 'New words.' } });
		await save();

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(saved).toEqual([
			{
				title: 'Faith Over Fear',
				speaker: { id: 2 },
				series: { id: 2 },
				date: '2026-05-03',
				description: 'New words.',
				tags: [],
			},
		]);
	});

	it('sends no series when it is cleared', async () => {
		const { onClose } = renderModal();

		fireEvent.change(select('Series'), { target: { value: '' } });
		await save();

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(saved[0]).toMatchObject({ series: null });
	});

	it('leaves the date out when it is cleared, so the saved date stays', async () => {
		const { onClose } = renderModal();

		fireEvent.change(input('Date'), { target: { value: '' } });
		await save();

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(saved[0]).not.toHaveProperty('date');
	});

	it('refuses a blank description without sending anything', async () => {
		const { onClose } = renderModal();

		fireEvent.change(input('Description'), { target: { value: '   ' } });
		await save();

		await screen.findByText('Description is required');
		expect(saved).toEqual([]);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('refuses a missing speaker without sending anything', async () => {
		const { onClose } = renderModal();

		fireEvent.change(select('Speaker'), { target: { value: '' } });
		await save();

		await screen.findByText('Speaker is required');
		expect(saved).toEqual([]);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('clears a field error as soon as the field is edited', async () => {
		renderModal();

		fireEvent.change(input('Description'), { target: { value: '' } });
		await save();
		await screen.findByText('Description is required');

		fireEvent.change(input('Description'), { target: { value: 'Words.' } });
		expect(screen.queryByText('Description is required')).toBeNull();
	});
});
