import 'sanitize.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';

import Dashboard from './Dashboard.tsx';
import Sermons from './Sermons.tsx';
import Series from './Series.tsx';
import Speakers from './Speakers.tsx';
import AISearch from './AISearch.tsx';
import ImportUpload from './ImportUpload.tsx';
import TagsAndMetadata from './TagsAndMetadata.tsx';
import UserManagement from './UserManagement.tsx';
import Notifications from './Notifications.tsx';
import Settings from './Settings.tsx';
import Transcripts from './Transcripts.tsx';

// biome-ignore lint/style/noNonNullAssertion: we'd want to throw anyways
createRoot(document.getElementById('root')!).render(
	<StrictMode>
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
	</StrictMode>,
);
