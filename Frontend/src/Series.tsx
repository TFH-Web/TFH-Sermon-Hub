import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import NewSeriesModal from '$/modals/NewSeriesModal';
import './Series.css';

export default function Series() {
	const [newSeriesOpen, setNewSeriesOpen] = useState(false);

	return (
		<MainLayout title="Series">
			<div className="Series-header">
				<button
					type="button"
					className="Series-newButton"
					onClick={() => setNewSeriesOpen(true)}
				>
					+ New Series
				</button>
			</div>

			<h2>Stinky cheese</h2>

			<NewSeriesModal
				isOpen={newSeriesOpen}
				onClose={() => setNewSeriesOpen(false)}
			/>
		</MainLayout>
	);
}
