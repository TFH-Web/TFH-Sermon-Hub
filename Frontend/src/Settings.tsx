import MainLayout from '$/components/MainLayout';
import TabBar from '$/components/TabBar';
import { useState } from 'react';


const tabs = ['General', 'Authentication', 'AI Configuration', 'Security', 'Backup'];

export default function Settings() {
	const [activeTab, setActiveTab] = useState('General');

	return (
		<MainLayout title="Settings">
			{/* Subheader */}
			<div className="Settings-header">
				<h2 className="Settings-heading">Settings</h2>
			</div>

			{/* Tab bar */}
			<TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
		</MainLayout>
	);
}
