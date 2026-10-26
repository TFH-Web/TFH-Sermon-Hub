import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { useAuth, useIsAdmin } from '$/lib/auth';
import { Sermon } from '$/types/sermon';
import Button from './Button';
import ErrorBox from './ErrorBox';
import { useToast } from './ToastContext';

// The parent keys this editor by sermon and session, so navigation discards drafts.
export default function ManualSummaryEditor({ sermon }: { sermon: Sermon }) {
	const isAdmin = useIsAdmin();
	const queryClient = useQueryClient();
	const { showToast } = useToast();
	const [draft, setDraft] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const sending = useRef(false);
	const active = useRef(true);
	const sessionGeneration = useRef(0);

	useEffect(() => {
		active.current = true;
		const unsubscribe = useAuth.subscribe((state, previous) => {
			if (
				state.account?.homeAccountId !== previous.account?.homeAccountId ||
				state.status !== previous.status ||
				state.roles.includes('Admin') !== previous.roles.includes('Admin')
			) {
				sessionGeneration.current += 1;
			}
		});
		return () => {
			active.current = false;
			unsubscribe();
		};
	}, []);

	const save = async () => {
		if (!isAdmin || draft === null || sending.current) return;
		sending.current = true;
		setPending(true);
		setError(null);
		const generation = sessionGeneration.current;
		const stillCurrent = () =>
			active.current && generation === sessionGeneration.current;
		try {
			const response = await axios.patch(`/api/sermons/${sermon.id}`, {
				summary: draft,
			});
			const saved = await Sermon.parseAsync(response.data);
			if (!stillCurrent()) return;
			queryClient.setQueryData(['sermon', String(sermon.id)], saved);
			void queryClient.invalidateQueries({ queryKey: ['sermons'] });
			setDraft(null);
			showToast('Summary saved successfully.', 'success');
		} catch (cause) {
			if (!stillCurrent()) return;
			const data = axios.isAxiosError(cause) ? cause.response?.data : null;
			setError(
				typeof data?.message === 'string'
					? data.message
					: typeof data?.error === 'string'
						? data.error
						: 'Could not save summary. Your draft is still here; try saving again.',
			);
		} finally {
			if (stillCurrent()) {
				sending.current = false;
				setPending(false);
			}
		}
	};

	return (
		<div className="SermonDetail-summary-edit-container">
			{draft === null ? (
				<Button
					type="button"
					variant="secondary"
					className="SermonDetail-summary-btn"
					disabled={!isAdmin}
					onClick={() => {
						setDraft(sermon.summary ?? '');
						setError(null);
					}}
				>
					Edit Summary Manually
				</Button>
			) : (
				<div className="SermonDetail-summary-editing">
					<label htmlFor="manual-summary">Summary text</label>
					<textarea
						id="manual-summary"
						className="SermonDetail-summary-textarea"
						value={draft}
						disabled={!isAdmin || pending}
						onChange={event => setDraft(event.target.value)}
					/>
					{error && <ErrorBox message={error} onRetry={save} />}
					<div className="SermonDetail-summary-actions">
						<Button
							type="button"
							variant="secondary"
							className="SermonDetail-summary-btn"
							disabled={pending}
							onClick={() => {
								setDraft(null);
								setError(null);
							}}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="secondary"
							className="SermonDetail-summary-btn"
							disabled={!isAdmin || pending}
							onClick={() => {
								setDraft(sermon.summary ?? '');
								setError(null);
							}}
						>
							Reset
						</Button>
						<Button
							type="button"
							variant="primary"
							className="SermonDetail-summary-btn"
							disabled={!isAdmin || pending}
							onClick={save}
						>
							{pending ? 'Saving...' : 'Save'}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
