import { useState } from 'react';
import Button from '$/components/Button';
import './AddSermon.css';
import UploadSermonModal from '$/modals/UploadSermonModal';

export default function ModalWithFAB() {
	const [open, setOpen] = useState(false);

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
