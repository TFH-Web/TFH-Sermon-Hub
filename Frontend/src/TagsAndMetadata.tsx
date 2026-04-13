import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import AddTagModal from '$/modals/AddTagModal';
import Table from '$/modals/Tags';

export default function TagsAndMetadata() {
	const [addTagOpen, setAddTagOpen] = useState(false);

	return (
		<MainLayout title="Tags & Metadata">
			<div>
			<div
				style={{
					display: 'flex',
					justifyContent: 'flex-end',
					width: '100%',
				}}
			>
				<button
					key={'addtag'}
					className="Header-upload"
					type="button"
					onClick={() => setAddTagOpen(true)}
					style={{
						right: 0,
						height: '40px',
						padding: '0 16px',
						marginRight: '1.8rem',
						marginTop: '0.5rem',
						// borderRadius: '999px',
						border: '1px solid #d8d8d8',
						// background: 'addtag' ? '#7a9166' : '#ffffff',
						// color: type === option.value ? '#ffffff' : '#363636',
						background: '#5e6f55',
						color: '#ffffff',
						fontWeight: 600,
						cursor: 'pointer',
					}}
				>
					+ Add Tag
				</button>
			</div>
			<Table />
			<AddTagModal
				isOpen={addTagOpen}
				onClose={() => setAddTagOpen(false)}
			></AddTagModal>
			</div>
		</MainLayout>
	);
}
