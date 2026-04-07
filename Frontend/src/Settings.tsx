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
					</Card>
				</div>
			)}
		</MainLayout>
	);
}