import { useState } from 'react';
import './ImportUpload.css';
import Button from '$/components/Button';
import { Card, CardHeader } from '$/components/Card';
import { FormField, FormRow } from '$/components/FormField';
import ImportItem from '$/components/ImportItem';
import MainLayout from '$/components/MainLayout';
import TabBar from '$/components/TabBar';
import Tag from '$/components/Tag';
import { useToast } from '$/components/ToastContext';
import UploadZone from '$/components/UploadZone';
import { activeImports, failedImports, importHistory } from '$/data/imports';
import UploadSermonModal from '$/modals/UploadSermonModal';

const tabs = ['Upload New', 'Bulk Import', 'Import History', 'Failed Imports'];

export default function ImportUpload() {
	const [activeTab, setActiveTab] = useState('Upload New');
	const [uploadOpen, setUploadOpen] = useState(false);
	const { showToast } = useToast();

	return (
		<MainLayout title="Import / Upload">
			<div className="ImportUpload-header">
				<h2 className="ImportUpload-heading">Import & Upload</h2>
			</div>

			<TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

			{activeTab === 'Upload New' && (
				<div className="ImportUpload-grid">
					<div>
						<UploadZone
							onClick={() => setUploadOpen(true)}
							className="ImportUpload-uploadZone"
						/>
						<Card>
							<CardHeader title="AI Processing Options" />
							<div className="Card-body">
								<div className="ImportUpload-checkboxGroup">
									<label className="ImportUpload-checkbox">
										<input type="checkbox" defaultChecked />
										Auto-generate transcript via AI
									</label>
									<label className="ImportUpload-checkbox">
										<input type="checkbox" defaultChecked />
										Auto-generate summary via AI
									</label>
									<label className="ImportUpload-checkbox">
										<input type="checkbox" defaultChecked />
										Auto-generate tags via AI
									</label>
								</div>
							</div>
						</Card>
					</div>

					<div>
						<Card>
							<CardHeader title="Active Imports" />
							<div className="Card-body">
								{activeImports.length > 0 ? (
									activeImports.map(job => (
										<ImportItem key={job.id} job={job} />
									))
								) : (
									<p className="ImportUpload-empty">No active imports</p>
								)}
							</div>
						</Card>
					</div>
				</div>
			)}

			{activeTab === 'Bulk Import' && (
				<div className="ImportUpload-grid">
					<Card>
						<CardHeader title="Bulk Import from Library" />
						<div className="Card-body">
							<FormField label="Import Source">
								<select>
									<option>YouTube Channel</option>
									<option>Vimeo Account</option>
									<option>Local File Batch</option>
								</select>
							</FormField>
							<FormField label="YouTube Channel URL">
								<input
									type="text"
									placeholder="https://youtube.com/@thefathershouse"
								/>
							</FormField>
							<FormField label="Date Range (optional)">
								<FormRow>
									<input type="date" />
									<input type="date" />
								</FormRow>
							</FormField>
							<Button
								variant="primary"
								onClick={() =>
									showToast(
										'Import started — 148 videos queued for processing',
										'success',
									)
								}
							>
								Start Bulk Import
							</Button>
						</div>
					</Card>

					<Card>
						<CardHeader title="Active Imports" />
						<div className="Card-body">
							{activeImports.map(job => (
								<ImportItem key={job.id} job={job} />
							))}
						</div>
					</Card>
				</div>
			)}

			{activeTab === 'Import History' && (
				<Card>
					<CardHeader title="Import History" />
					<div className="Card-body">
						{importHistory.length > 0 ? (
							importHistory.map(job => <ImportItem key={job.id} job={job} />)
						) : (
							<p className="ImportUpload-empty">No import history yet</p>
						)}
					</div>
				</Card>
			)}

			{activeTab === 'Failed Imports' && (
				<Card>
					<CardHeader
						title="Failed Imports"
						action={<Tag variant="red">{failedImports.length} items</Tag>}
					/>
					<div className="Card-body">
						{failedImports.length > 0 ? (
							failedImports.map(job => <ImportItem key={job.id} job={job} />)
						) : (
							<p className="ImportUpload-empty">No failed imports</p>
						)}
					</div>
				</Card>
			)}

			<UploadSermonModal
				isOpen={uploadOpen}
				onClose={() => setUploadOpen(false)}
			/>
		</MainLayout>
	);
}
