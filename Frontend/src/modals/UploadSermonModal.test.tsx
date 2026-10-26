// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, {
	type AxiosAdapter,
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from 'axios';
import { useState } from 'react';
// From react-router-dom, like the modal, so the router and its useNavigate are the same instance.
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import UploadSermonModal from './UploadSermonModal';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('$/components/ToastContext', () => ({
	useToast: () => ({ showToast }),
}));

// What POST /api/import/youtube/video sends for a sermon: a new one with 201, or one imported before with 200.
const SERMON = {
	id: 7,
	title: 'Hope Rising',
	videoLink: 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y',
	duration: 2400,
	date: '2026-09-14',
	description: 'A message about hope.',
	tags: [],
	speaker: { id: 1, firstName: 'Dave', lastName: 'Patterson' },
	series: { id: 2, title: 'Together' },
	status: 'Processing',
};

const LINK = 'https://youtu.be/F_OiCiZ3Y3Y';
const IMPORTED_TOAST = 'Imported "Hope Rising". Processing started.';

// The fake server. Each test sets how the import is answered, and can hold the answer back.
const originalAdapter = axios.defaults.adapter;
let importReply: (config: InternalAxiosRequestConfig) => AxiosResponse;
let gate: Promise<void>;
let bodies: unknown[];

/** Answer with data, or throw the error axios would for a status of 400 or more. */
function reply(
	config: InternalAxiosRequestConfig,
	status: number,
	data: unknown,
): AxiosResponse {
	const response = {
		data,
		status,
		statusText: String(status),
		headers: {},
		config,
	};
	if (status < 400) return response;
	throw new AxiosError(
		`Request failed with status code ${status}`,
		'ERR_BAD_RESPONSE',
		config,
		undefined,
		response,
	);
}

const adapter: AxiosAdapter = async config => {
	if (config.method === 'post' && config.url === '/api/import/youtube/video') {
		bodies.push(config.data);
		await gate;
		return importReply(config);
	}
	throw new Error(`Unexpected request: ${config.method} ${config.url}`);
};

beforeEach(() => {
	vi.clearAllMocks();
	bodies = [];
	gate = Promise.resolve();
	importReply = config => reply(config, 201, SERMON);
	axios.defaults.adapter = adapter;
});

afterEach(() => {
	cleanup();
	axios.defaults.adapter = originalAdapter;
});

/** Where Open sermon leads, so a test can tell the dialog sent the admin to the right sermon. */
function SermonPage() {
	const { id } = useParams();
	return <p>Sermon page {id}</p>;
}

/** The dialog with an Open button beside it, so a test can close it and open it again. */
function Host() {
	const [open, setOpen] = useState(true);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				Open dialog
			</button>
			<UploadSermonModal isOpen={open} onClose={() => setOpen(false)} />
		</>
	);
}

function renderDialog() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<Routes>
					<Route path="/" element={<Host />} />
					<Route path="/sermons/:id" element={<SermonPage />} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

function linkField() {
	return screen.getByLabelText('YouTube link') as HTMLInputElement;
}

async function importLink(link = LINK) {
	if (link) await userEvent.type(linkField(), link);
	await userEvent.click(
		screen.getByRole('button', { name: 'Import & Process' }),
	);
}

/** The × in the header. The footer has a Close of its own once there is a preview, so a name alone would match both. */
async function closeDialog() {
	await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
}

function previewField(label: string) {
	return screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
}

it('shows only the link field before importing', () => {
	renderDialog();

	expect(linkField().value).toBe('');
	expect(screen.queryByLabelText('Sermon title')).toBeNull();
	expect(screen.queryByLabelText('Speaker')).toBeNull();
	expect(screen.queryByLabelText('Series')).toBeNull();
	expect(screen.queryByLabelText('Date')).toBeNull();
	expect(screen.queryByLabelText('Description')).toBeNull();
	// No dropdowns of fixed speakers or series, and no processing choices the import would ignore.
	expect(screen.queryByRole('combobox')).toBeNull();
	expect(screen.queryByRole('checkbox')).toBeNull();
});

it('sends only the link', async () => {
	renderDialog();
	await importLink();

	await screen.findByLabelText('Sermon title');
	expect(bodies).toHaveLength(1);
	expect(JSON.parse(bodies[0] as string)).toEqual({ url: LINK });
});

it('adds https:// to a link pasted without it', async () => {
	renderDialog();
	await importLink('youtu.be/F_OiCiZ3Y3Y');

	await screen.findByLabelText('Sermon title');
	expect(JSON.parse(bodies[0] as string)).toEqual({ url: LINK });
});

it('shows a new import as a read-only preview, and Open sermon goes to the sermon', async () => {
	renderDialog();
	await importLink();

	await screen.findByLabelText('Sermon title');
	expect(previewField('Sermon title').value).toBe('Hope Rising');
	expect(previewField('Speaker').value).toBe('Dave Patterson');
	expect(previewField('Series').value).toBe('Together');
	expect(previewField('Date').value).toBe('2026-09-14');
	expect(previewField('Description').value).toBe('A message about hope.');
	for (const label of [
		'Sermon title',
		'Speaker',
		'Series',
		'Date',
		'Description',
	]) {
		expect(previewField(label).readOnly).toBe(true);
	}
	// The link is done with, so it cannot be sent again.
	expect(linkField().disabled).toBe(true);
	expect(showToast).toHaveBeenCalledWith(IMPORTED_TOAST, 'success');

	await userEvent.click(screen.getByRole('button', { name: 'Open sermon' }));
	await screen.findByText('Sermon page 7');
});

it('says "No series" for a sermon that has none', async () => {
	importReply = config => reply(config, 201, { ...SERMON, series: null });
	renderDialog();
	await importLink();

	await screen.findByLabelText('Sermon title');
	expect(previewField('Series').value).toBe('No series');
});

it('says a duplicate import was already imported, and still offers Open sermon', async () => {
	importReply = config => reply(config, 200, SERMON);
	renderDialog();
	await importLink();

	await screen.findByLabelText('Sermon title');
	expect(showToast).toHaveBeenCalledWith(
		'"Hope Rising" was already imported.',
		'info',
	);
	expect(previewField('Sermon title').value).toBe('Hope Rising');

	await userEvent.click(screen.getByRole('button', { name: 'Open sermon' }));
	await screen.findByText('Sermon page 7');
});

it('reports an import whose processing failed, and still shows what was imported', async () => {
	importReply = config =>
		reply(config, 201, {
			...SERMON,
			status: 'Failed',
			processingError: 'fetch_transcript: no captions',
		});
	renderDialog();
	await importLink();

	await screen.findByLabelText('Sermon title');
	expect(showToast).toHaveBeenCalledWith(
		'Imported "Hope Rising", but processing failed: fetch_transcript: no captions',
		'error',
	);
});

it.each([
	['not a link', 'That is not a YouTube link.'],
	['', 'Paste a YouTube link.'],
	[
		'https://www.youtube.com/playlist?list=PL0123456789',
		'Only video links are supported: youtube.com/watch?v=…, youtu.be/… or youtube.com/shorts/…',
	],
])('rejects the link %j with a message, and sends nothing', async (link, message) => {
	renderDialog();
	await importLink(link);

	await screen.findByText(message);
	expect(bodies).toHaveLength(0);
	expect(screen.queryByLabelText('Sermon title')).toBeNull();
});

it('clears a link error as soon as the link is edited', async () => {
	renderDialog();
	await importLink('not a link');
	await screen.findByText('That is not a YouTube link.');

	await userEvent.type(linkField(), 'x');
	expect(screen.queryByText('That is not a YouTube link.')).toBeNull();
});

it.each([
	[403, { error: 'Forbidden' }, 'Only admins can import sermons.'],
	[
		404,
		{ error: 'Video not found', message: 'Video not found' },
		'Video not found',
	],
	[
		422,
		{
			error: 'This video is still streaming.',
			message: 'This video is still streaming.',
		},
		'This video is still streaming.',
	],
	[
		502,
		{
			error: 'YouTube is not available right now.',
			message: 'YouTube is not available right now.',
		},
		'YouTube is not available right now.',
	],
	[500, {}, 'Could not import the video. Try again.'],
])('shows the reason under the link when the server answers %i', async (status, body, message) => {
	importReply = config => reply(config, status, body);
	renderDialog();
	await importLink();

	await screen.findByText(message);
	expect(screen.queryByLabelText('Sermon title')).toBeNull();
	// The dialog is open, so the reason is shown there and not in a toast. The link can be fixed and sent again.
	expect(showToast).not.toHaveBeenCalled();
	expect(linkField().disabled).toBe(false);
});

it('locks the link and shows progress while the import runs', async () => {
	let release = () => {};
	gate = new Promise<void>(resolve => {
		release = resolve;
	});
	renderDialog();
	await importLink();

	const busy = (await screen.findByRole('button', {
		name: 'Importing…',
	})) as HTMLButtonElement;
	expect(busy.disabled).toBe(true);
	expect(linkField().disabled).toBe(true);

	release();
	await screen.findByLabelText('Sermon title');
});

it('clears the link, an error and a preview when the dialog is closed and opened again', async () => {
	renderDialog();
	await importLink('not a link');
	await screen.findByText('That is not a YouTube link.');

	await closeDialog();
	expect(screen.queryByRole('dialog')).toBeNull();
	await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
	expect(linkField().value).toBe('');
	expect(screen.queryByText('That is not a YouTube link.')).toBeNull();

	await importLink();
	await screen.findByLabelText('Sermon title');

	await closeDialog();
	await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
	expect(linkField().value).toBe('');
	expect(linkField().disabled).toBe(false);
	expect(screen.queryByLabelText('Sermon title')).toBeNull();
});

it('does not fill in a reopened dialog when an import ends after it was closed', async () => {
	let release = () => {};
	gate = new Promise<void>(resolve => {
		release = resolve;
	});
	renderDialog();
	await importLink();
	await screen.findByRole('button', { name: 'Importing…' });

	// Closed with the import still running, then opened again for another go.
	await closeDialog();
	await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
	const idle = screen.getByRole('button', {
		name: 'Import & Process',
	}) as HTMLButtonElement;
	expect(idle.disabled).toBe(false);
	expect(linkField().value).toBe('');

	// The first import ends. The admin is still told, but what it imported is not put in front of them.
	release();
	await waitFor(() =>
		expect(showToast).toHaveBeenCalledWith(IMPORTED_TOAST, 'success'),
	);
	await act(async () => {});
	expect(screen.queryByLabelText('Sermon title')).toBeNull();
	expect(linkField().value).toBe('');
	expect(linkField().disabled).toBe(false);
});

it('does not put the error of an import that ends after a close in a reopened dialog', async () => {
	let release = () => {};
	gate = new Promise<void>(resolve => {
		release = resolve;
	});
	importReply = config =>
		reply(config, 502, {
			error: 'YouTube is not available right now.',
			message: 'YouTube is not available right now.',
		});
	renderDialog();
	await importLink();
	await screen.findByRole('button', { name: 'Importing…' });

	await closeDialog();
	await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

	release();
	await waitFor(() =>
		expect(showToast).toHaveBeenCalledWith(
			'YouTube is not available right now.',
			'error',
		),
	);
	await act(async () => {});
	expect(screen.queryByText('YouTube is not available right now.')).toBeNull();
});
