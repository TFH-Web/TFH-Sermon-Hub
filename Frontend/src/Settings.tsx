import MainLayout from '$/components/MainLayout';
import TabBar from '$/components/TabBar';
import { useState } from 'react';
import './Settings.css';
import { Card, CardHeader } from '$/components/Card';
import { FormField } from '$/components/FormField';
import Tag from '$/components/Tag';
import Button from '$/components/Button';
import { useToast } from '$/components/ToastContext';
import { InfoBanner } from '$/components/InfoBanner';


const tabs = ['General', 'Authentication', 'AI Configuration', 'Security', 'Backup'];

export default function Settings() {
	const [activeTab, setActiveTab] = useState('General');
	const { showToast } = useToast();

	return (
		<MainLayout title="Settings">
			{/* Subheader */}
			<div className="Settings-header">
				<h2 className="Settings-heading">Settings</h2>
			</div>

			{/* Tab bar */}
			<TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

			{/* Authentication Tab */}
			{activeTab === 'Authentication' && (
				<div className="Settings-grid">
					{/* Microsoft Entra SSO Settings */}					
					<Card>
						<CardHeader title="Microsoft Entra SSO" />
						<div className="Card-body">
							<InfoBanner 
								message="All authentication is handled through Microsoft Entra SSO. Users must log in with their organizational account."
							/>
							<FormField label="Tenant ID">
								<input 
									type="text" 
									placeholder="tfh-org-tenant-abc123" 
								/>
							</FormField>
							<FormField label="Client ID">
								<input 
									type="text" 
									placeholder="••••••••-••••-••••-••••-••••••••" 
								/>
							</FormField>
							<FormField label="Redirect URI">
								<input 
									type="text" 
									placeholder="https://sermonhub.tfh.org/auth/callback" 
								/>
							</FormField>
							<FormField label="SSO Status">
								<Tag variant="green">Connected & Active</Tag>
							</FormField>
							<Button
								variant="secondary"
								onClick={() =>
									showToast(
										'Contact IT to reconfigure SSO credentials',
										"info"
									)
								}
							>
								Reconfigure SSO
							</Button>					
						</div>
					</Card>

					{/* Session Settings */}
					<Card>
						<CardHeader title="Session Settings" />
						<div className="Card-body">
							<FormField label="Session Timeout">
								<select>
									<option>8 hours</option>
									<option>4 hours</option>
									<option>24 hours</option>
									<option>1 hour</option>
								</select>
							</FormField>
							<FormField label="Idle Timeout">
								<select>
									<option>30 minutes</option>
									<option>15 minutes</option>
									<option>1 hour</option>
									<option>Never</option>
								</select>
							</FormField>
							<div className="Settings-checkboxGroup">
								<label className="Settings-checkbox">
									<input type="checkbox" defaultChecked />
									Require re-authentication after session expiry
								</label>
								<label className="Settings-checkbox">
									<input type="checkbox" defaultChecked />
									Log out all sessions on password change
								</label>
							</div>
							<div style={{ marginTop: '16px' }}>
								<Button
									variant="primary"
									onClick={() =>
										showToast(
											'Session settings saved',
										)
									}
								>
									Save Settings
								</Button>	
							</div>
						</div>
					</Card>
				</div>
			)}

			{/* AI Configuration Tab */}
			{activeTab === 'AI Configuration' && (
				<div className="Settings-grid">
					{/* AI Provider Settings */}
					<Card>
						<CardHeader title="AI Provider Settings" />
						<div className="Card-body">
							<FormField label="Provider">
								<select>
									<option>Local LLM (Development)</option>
									<option>Claude API</option>
									<option>ChatGPT API</option>
								</select>
							</FormField>
							<InfoBanner 
								message="Switch between local AI (free, for development) and paid API (production). Configure per-environment in deployment settings."
								variant="gray"
							/>
							<FormField label="API Key">
								<input
									type="text"
									placeholder="sk-•••••••••••••"
								/>
							</FormField>
							<FormField label="Model">
								<select>
									<option>claude-opus-4 (Best quality)</option>
									<option>claude-sonnet-4 (Balanced)</option>
									<option>gpt-4o</option>
									<option>gpt-4o-mini (Faster/Lower cost)</option>
								</select>
							</FormField>
							<Button
								variant="primary"
								onClick={() =>
									showToast(
										'AI provider settings saved',
									)
								}>
						
								Save Provider
							</Button>
						</div>
					</Card>

					{/* Processing Options */}
					<Card>
						<CardHeader title="Processing Options" />
						<div className="Card-body">
							<FormField label="Processing Mode">
								<select>
									<option>Process at Import Time (one-time cost)</option>
									<option>Process on Demand</option>
								</select>
							</FormField>
							<FormField label="Transcript Language">
								<select>
									<option>Auto-detect</option>
									<option>English</option>
									<option>Spanish</option>
								</select>
							</FormField>
							<FormField label="Auto-generate on Import">
								<div className="Settings-checkboxGroup">
									<label className="Settings-checkbox">
										<input type="checkbox" defaultChecked />
										Transcripts
									</label>
									<label className="Settings-checkbox">
										<input type="checkbox" defaultChecked />
										Summaries
									</label>
									<label className="Settings-checkbox">
										<input type="checkbox" defaultChecked />
										Tags (weighted by relevance)
									</label>
								</div>
							</FormField>
							<Button
								variant="primary"
								onClick={() =>
									showToast(
										'Processing settings saved',
									)
								}>
						
								Save Settings
							</Button>
						</div>
					</Card>
				</div>
			)}

			{/* Security Tab */}
			{activeTab === 'Security' && (
				<div className="Settings-grid">
					{/* Access Control Settings */}
					<Card>
						<CardHeader title="Access Control" />
						<div className="Card-body">
							<div className="Settings-checkboxGroup">
								<label className="Settings-checkbox">
									<input type="checkbox" />
									Require login for all access
								</label>
								<label className="Settings-checkbox">
									<input type="checkbox" defaultChecked />
									HTTPS only
								</label>
								<label className="Settings-checkbox">
									<input type="checkbox" defaultChecked />
									Secure session cookies (HttpOnly, SameSite, Max-Age)
								</label>
								<label className="Settings-checkbox">
									<input type="checkbox"/>
									Allow public read-only API access
								</label>
								<label className="Settings-checkbox">
									<input type="checkbox"/>
									Enable audit logging
								</label>
							</div>
							<div style={{ marginTop: '16px' }}>
								<Button
									variant="primary"
									onClick={() =>
										showToast(
											'Security settings saved',
										)
									}>
							
									Save Settings
								</Button>
							</div>
						</div>
					</Card>

					{/* Roles & Privacy Levels */}
					<Card>
						<CardHeader title="Roles & Privacy Levels" />
						<div className="Card-body">
							<div className = "Settings-roles-body">		
								<p className="Settings-roles-text">
									<span><strong>Admin - </strong> Full access, manage users, upload, edit, delete</span>
									<Tag variant="admin">Level 3</Tag>
								</p>		
								<p className="Settings-roles-text">
									<span><strong>Internal User - </strong> View, search, read transcripts</span>
									<Tag variant="blue">Level 2</Tag>
								</p>
								<p className="Settings-roles-text">
									<span><strong>Public (Future) - </strong> Basic search, read only</span>
									<Tag variant="outline">Level 1</Tag>
								</p>
							</div>
							<InfoBanner 
								message="Role assignments are managed in the user management section."
							/>
						</div>
					</Card>
				</div>
			)}
		</MainLayout>
	);
}