import { useState } from 'react';
import MainLayout from '$/components/MainLayout';
import TabBar from '$/components/TabBar';
import './Settings.css';
import { Link } from 'react-router-dom';
import Button from '$/components/Button';
import { Card, CardHeader } from '$/components/Card';
import { FormField } from '$/components/FormField';
import { InfoBanner } from '$/components/InfoBanner';
import Tag from '$/components/Tag';
import ProgressBar from '$/components/ProgressBar';
import { useToast } from '$/components/ToastContext';

const tabs = [
	'General',
	'Authentication',
	'AI Configuration',
	'Security',
	'Backup',
];

export default function Settings() {
	const [activeTab, setActiveTab] = useState('General');
	const { showToast } = useToast();

  // General Tab State 
  const [orgName, setOrgName] = useState("The Father's House");
  const [portalName, setPortalName] = useState('TFH Sermon Hub');
  const [adminEmail, setAdminEmail] = useState('admin@tfh.org');
  const [timezone, setTimezone] = useState('PT');
  const [dateFormat, setDateFormat] = useState('MDY');
  const [language, setLanguage] = useState('en-US');

  // Backup Tab
  const [automatedBackups, setAutomatedBackups] = useState(true);
  const [backupTime, setBackupTime] = useState('03:00');
  const [retentionDays, setRetentionDays] = useState('30');
  const [lastBackup] = useState('Today at 3:00 AM - Sucessful');

  // This is a TODO: replace with useQuery(()=> fetchHostingInfo()) when backend is ready
  const hostingInfo = {
    provider: 'DigitalOcean',
    region: 'SFO3 (SanFrancisco)',
    status: 'Healthy' as const,
    ssl: 'HTTPS Active' as const,
    storageUsedGB: 24.6,
    storageTotalGB: 100,
  };

	return (
		<MainLayout title="Settings">
			{/* Tab bar */}
			<TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

			{/* Authentication Tab */}
			{activeTab === 'Authentication' && (
				<div className="Settings-grid">
					{/* Microsoft Entra SSO Settings */}
					<Card>
						<CardHeader title="Microsoft Entra SSO" />
						<div className="Card-body">
							<InfoBanner message="All authentication is handled through Microsoft Entra SSO. Users must log in with their organizational account." />
							<FormField label="Tenant ID">
								<input type="text" placeholder="tfh-org-tenant-abc123" />
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
									showToast('Contact IT to reconfigure SSO credentials', 'info')
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
									onClick={() => showToast('Session settings saved')}
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
								<input type="text" placeholder="sk-•••••••••••••" />
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
								onClick={() => showToast('AI provider settings saved')}
							>
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
								onClick={() => showToast('Processing settings saved')}
							>
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
									<input type="checkbox" />
									Allow public read-only API access
								</label>
								<label className="Settings-checkbox">
									<input type="checkbox" />
									Enable audit logging
								</label>
							</div>
							<div style={{ marginTop: '16px' }}>
								<Button
									variant="primary"
									onClick={() => showToast('Security settings saved')}
								>
									Save Settings
								</Button>
							</div>
						</div>
					</Card>

					{/* Roles & Privacy Levels */}
					<Card>
						<CardHeader title="Roles & Privacy Levels" />
						<div className="Card-body">
							<div className="Settings-roles-body">
								<p className="Settings-roles-text">
									<span>
										<strong>Admin - </strong> Full access, manage users, upload,
										edit, delete
									</span>
									<Tag variant="admin">Level 3</Tag>
								</p>
								<p className="Settings-roles-text">
									<span>
										<strong>Internal User - </strong> View, search, read
										transcripts
									</span>
									<Tag variant="blue">Level 2</Tag>
								</p>
								<p className="Settings-roles-text">
									<span>
										<strong>Public (Future) - </strong> Basic search, read only
									</span>
									<Tag variant="outline">Level 1</Tag>
								</p>
							</div>
							<InfoBanner
								message={
									<>
										Role assignments are managed in{' '}
										<Link to="/user-management">User Management</Link>.
									</>
								}
							/>
						</div>
					</Card>
				</div>
			)}
      {/* --- General Tab ---*/} 
      {activeTab === 'General' && (
        <div className="Settings-grid">
          <Card>
            <CardHeader title="Organization"/>
            <div className="Card-body">
              <FormField label="Church Name">
                <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} />
              </FormField>
              <FormField label="Portal Display Name">
                <input type="text" value={portalName} onChange={e => setPortalName(e.target.value)} />
              </FormField>
              <FormField label="Admin Contact Email">
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
              </FormField>
              <Button
                variant="primary"
                onClick={() => showToast('General settings saved')}
                > 
                  Save Changes
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Regional Settings"/>
            <div className="Card-body">
              <FormField label="Timezone">
                <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                  <option value="PT">Pacific Time (PT) - UTC-8</option>
                  <option value="ET">Eastern Time (EST) - UTC-5</option>
                  <option value="CT">Central Time (CT) - UTC-6</option>
                </select>
              </FormField>
              <FormField label="Date Format">
                <select value={dateFormat} onChange={e => setDateFormat(e.target.value)}>
                  <option value="MDY">MM/DD/YYYY</option>
                  <option value="DMY">DD/MM/YYYY</option>
                  <option value="ISO">YYYY-MM-DD</option>
                </select>
              </FormField>
              <FormField label="Language">
                <select value={language} onChange={e => setLanguage(e.target.value)}>
                  <option value="en-US">English (US)</option>
                  <option value="en-UK">English (UK)</option>
                </select>
              </FormField>
              <Button
                variant="primary"
                onClick={() => showToast('Regional settings saved')}
                >
                Save Changes
              </Button>
            </div>
          </Card>
         </div>
      )}
      {/* ---Backup TAB--- */}
      {activeTab === 'Backup' &&(
        <div className="Settings-grid">
          <Card>
            <CardHeader title="Hosting & Infrastructure" />
            <div className="Card-body">
              <div className="Settings-infoRow">
                <span className="Settings-infoLabel">Provider</span>
                <span>{hostingInfo.provider}</span>
              </div>
              <div className="Settings-infoRow">
              <span className="Settings-infoLabel">Region</span>
              <span>{hostingInfo.region}</span>
              </div>
              <div className="Settings-infoRow">
                <span className="Settings-infoLabel">Status</span>
                <Tag variant="green">{hostingInfo.status}</Tag>
              </div>
              <div className="Settings-infoRow">
                <span className="Settings-infoLabel">SSL</span>
                <Tag variant="green">{hostingInfo.ssl}</Tag>
              </div>
              <div className="Settings-storageSection">
                <p className="Settings-storageText">
                  {hostingInfo.storageUsedGB} GB / {hostingInfo.storageTotalGB} GB 
                </p>
                <ProgressBar percent={Math.round((hostingInfo.storageUsedGB / hostingInfo.storageTotalGB) * 100)} />
                <p className="Settings-storageLabel">
                  {hostingInfo.storageUsedGB} GB of {hostingInfo.storageTotalGB} GB used ({Math.round((hostingInfo.storageUsedGB / hostingInfo.storageTotalGB) * 100)}%)
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Backup Schedule"/>
              <div className="Card-body">
                <label className="Settings-checkbox">
                  <input type="checkbox" checked={automatedBackups} onChange={e => setAutomatedBackups(e.target.checked)} />
                  Automated daily backups
                </label>
                <FormField label="Backup Time (server local)">
                  <input type="time" value={backupTime} onChange={e => setBackupTime(e.target.value)}/>
                </FormField>
                <FormField label="Retention Perios">
                  <select value={retentionDays} onChange={e => setRetentionDays(e.target.value)}>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 yeaer</option>
                  </select>
                </FormField>
                <FormField label="Last Backup">
                  <input type="text" value={lastBackup} readOnly />
                </FormField>
              <div className="Settings-backupActions">
                <Button variant="primary" onClick={() => showToast('Backup Settings saved')}>
                  Save Settings
                </Button>
                <Button variant="secondary" onClick={() => showToast('Manual backup started', 'info')}>
                  Run Now
                </Button>
              </div>
              </div>
          </Card>
          </div>
      )}
		</MainLayout>
	);
}
