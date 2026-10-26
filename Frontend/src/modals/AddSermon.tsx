import { useState } from 'react';
import Button from '$/components/Button';
import './AddSermon.css';
import { useIsAdmin } from '$/lib/auth';
import UploadSermonModal from '$/modals/UploadSermonModal';

export default function ModalWithFAB() {
	const [open, setOpen] = useState(false);
	const isAdmin = useIsAdmin();
	if (!isAdmin) return null;

	return (
		<>
			{/* Floating Green Button */}
			<Button
				variant="primary"
				className="fab-button"
				onClick={() => setOpen(true)}
			>
				+
			</Button>

			{/* Upload Modal */}
			<UploadSermonModal isOpen={open} onClose={() => setOpen(false)} />
		</>
	);
}
