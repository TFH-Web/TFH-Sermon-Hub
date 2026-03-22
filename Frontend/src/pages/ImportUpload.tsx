import { useState } from 'react';
import './ImportUpload.css';
import { Icon } from '@iconify-icon/react';
import Button from '$/components/Button';
import { Card, CardHeader } from '$/components/Card';
import { FormField, FormRow } from '$/components/FormField';
import ImportItem from '$/components/ImportItem';
import MainLayout from '$/components/MainLayout';
import ProgressBar from '$/components/ProgressBar';
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
									activeImports.map(imp => (
										<ImportItem
											key={imp.id}
											icon={<Icon icon={imp.icon} width={18} height={18} />}
											title={imp.title}
											subtitle={imp.subtitle}
											action={
												imp.progress != null ? (
													<div style={{ textAlign: 'right' }}>
														<ProgressBar percent={imp.progress} width="100px" />
														<small className="ImportUpload-progressLabel">
															{imp.progress}%
														</small>
													</div>
												) : (
													<Tag variant="amber">In Progress</Tag>
												)
											}
										/>
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
							{activeImports.map(imp => (
								<ImportItem
									key={imp.id}
									icon={<Icon icon={imp.icon} width={18} height={18} />}
									title={imp.title}
									subtitle={imp.subtitle}
									action={
										imp.progress != null ? (
											<div style={{ textAlign: 'right' }}>
												<ProgressBar percent={imp.progress} width="100px" />
												<small className="ImportUpload-progressLabel">
													{imp.progress}%
												</small>
											</div>
										) : (
											<Tag variant="amber">In Progress</Tag>
										)
									}
								/>
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
							importHistory.map(imp => (
								<ImportItem
									key={imp.id}
									icon={<Icon icon={imp.icon} width={18} height={18} />}
									title={imp.title}
									subtitle={imp.subtitle}
									action={
										<Tag variant={imp.errorMessage ? 'amber' : 'green'}>
											{imp.errorMessage ? 'Completed with errors' : 'Complete'}
										</Tag>
									}
								/>
							))
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
							failedImports.map(imp => (
								<ImportItem
									key={imp.id}
									icon={
										<Icon
											icon="lucide:circle-x"
											width={18}
											height={18}
											style={{ color: 'var(--cl-error)' }}
										/>
									}
									title={imp.title}
									subtitle={imp.errorMessage || ''}
									action={
										<Button
											variant="secondary"
											size="sm"
											onClick={() =>
												showToast(`Retrying ${imp.title}...`, 'info')
											}
										>
											Retry
										</Button>
									}
								/>
							))
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
