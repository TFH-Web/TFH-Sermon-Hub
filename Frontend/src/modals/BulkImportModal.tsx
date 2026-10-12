// Pops up when a "Sync from YouTube" run ends, to report what it was asked for and how it went.
import './BulkImportModal.css';
import Button from '$/components/Button';
import ImportSyncResult from '$/components/ImportSyncResult';
import Modal from '$/components/Modal';
import { formatDateRange } from '$/lib/date';
import type { BulkImport } from '$/types/import';

interface BulkImportModalProps {
	run: BulkImport;
	isOpen: boolean;
	onClose: () => void;
}

export default function BulkImportModal({
	run,
	isOpen,
	onClose,
}: BulkImportModalProps) {
	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="YouTube bulk import"
			footer={
				<Button variant="secondary" onClick={onClose}>
					Close
				</Button>
			}
		>
			<dl className="BulkImportModal-facts">
				<dt>Date range</dt>
				<dd>{formatDateRange(run.from, run.to)}</dd>
			</dl>

			{run.result ? (
				<ImportSyncResult result={run.result} />
			) : (
				<p className="BulkImportModal-error" role="alert">
					{run.error}
				</p>
			)}
		</Modal>
	);
}
