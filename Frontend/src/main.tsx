import 'sanitize.css';
import './index.css';

import {
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from '@tanstack/react-query';
import axios from 'axios';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { BrowserRouter, Route, Routes } from 'react-router';
import AIChat from './AIChat.tsx';
import AISearch from './AISearch.tsx';
import AISearchResults from './AISearchResults.tsx';
import MainLayout from './components/MainLayout.tsx';
import { ToastProvider, useToast } from './components/ToastContext';
import Dashboard from './Dashboard.tsx';
import LoginPage from './LoginPage.tsx';
import Notifications from './Notifications.tsx';
import ImportUpload from './pages/ImportUpload.tsx';
import Series from './Series.tsx';
import SermonDetail from './SermonDetail.tsx';
import Sermons from './Sermons.tsx';
import Settings from './Settings.tsx';
import Speakers from './Speakers.tsx';
import TagsAndMetadata from './TagsAndMetadata.tsx';
import UserManagement from './UserManagement.tsx';
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./authConfig";
import ProtectedRoute  from './components/ProtectedRoute';

const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error: Error) => {
			const { showToast } = useToast();
			showToast(`Something went wrong: ${error.message}`, 'error');
		},
	}),
});

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL;

axios.interceptors.request.use(async (config) => {
	const accounts = msalInstance.getAllAccounts();
	if (accounts.length > 0) {
		try {
			const response = await msalInstance.acquireTokenSilent({
				account: accounts[0],
				scopes: ['openid', 'profile'],
			});
			config.headers.Authorization = `Bearer ${response.idToken}`;
		} catch (error) {
			console.error('Failed to acquire token for request:', error);
		}
	}
	return config;
});

// biome-ignore lint/style/noNonNullAssertion: we'd want to throw anyways
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<MsalProvider instance={msalInstance}>
			<QueryClientProvider client={queryClient}>
				<ToastProvider>
					<BrowserRouter>
						<ErrorBoundary
							fallback={<MainLayout title="Error">Error!</MainLayout>}
						>
							<Routes>
								<Route path="/login" element={<LoginPage />} />
								<Route element={<ProtectedRoute />}>
									<Route index element={<Dashboard />} />
									<Route path="/login" element={<LoginPage />} />
									<Route path="/sermons" element={<Sermons />} />
									<Route path="/sermons/:id" element={<SermonDetail />} />
									<Route path="/series" element={<Series />} />
									<Route path="/speakers" element={<Speakers />} />
									<Route path="/ai-search" element={<AISearch />} />
									<Route path="/ai-search/results" element={<AISearchResults />} />
									<Route path="/ai-chat" element={<AIChat />} />
									<Route path="/upload" element={<ImportUpload />} />
									<Route path="/tags" element={<TagsAndMetadata />} />
									<Route path="/user-management" element={<UserManagement />} />
									<Route path="/notifications" element={<Notifications />} />
									<Route path="/settings" element={<Settings />} />
								</Route>
							</Routes>
						</ErrorBoundary>
					</BrowserRouter>
				</ToastProvider>
			</QueryClientProvider>
		</MsalProvider>
	</StrictMode>,
);
