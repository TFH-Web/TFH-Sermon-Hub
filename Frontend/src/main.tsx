import 'sanitize.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import AISearch from './AISearch.tsx';
import { ToastProvider } from './components/ToastContext';
import Dashboard from './Dashboard.tsx';
import Notifications from './Notifications.tsx';
import ImportUpload from './pages/ImportUpload.tsx';
import Series from './Series.tsx';
import Sermons from './Sermons.tsx';
import Settings from './Settings.tsx';
import Speakers from './Speakers.tsx';
import TagsAndMetadata from './TagsAndMetadata.tsx';
import UserManagement from './UserManagement.tsx';
import Notifications from './Notifications.tsx';
import Settings from './Settings.tsx';
import Transcripts from './Transcripts.tsx';

// biome-ignore lint/style/noNonNullAssertion: we'd want to throw anyways
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ToastProvider>
			<BrowserRouter>
				<Routes>
					<Route index element={<Dashboard />} />
					<Route path="/sermons" element={<Sermons />} />
					<Route path="/series" element={<Series />} />
					<Route path="/speakers" element={<Speakers />} />
					<Route path="/ai-search" element={<AISearch />} />
					<Route path="/upload" element={<ImportUpload />} />
					<Route path="/tags" element={<TagsAndMetadata />} />
					<Route path="/transcripts" element={<Transcripts />} />
					<Route path="/user-management" element={<UserManagement />} />
					<Route path="/notifications" element={<Notifications />} />
					<Route path="/settings" element={<Settings />} />
				</Routes>
			</BrowserRouter>
		</ToastProvider>
	</StrictMode>,
);
