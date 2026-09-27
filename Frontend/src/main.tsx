import 'sanitize.css';
import './index.css';

import {
	QueryCache,
	QueryClient,
	QueryClientProvider,
	QueryErrorResetBoundary,
} from '@tanstack/react-query';
import axios from 'axios';
import { type PropsWithChildren, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import AIChat from './AIChat.tsx';
import AISearch from './AISearch.tsx';
import AISearchResults from './AISearchResults.tsx';
import ErrorBox from './components/ErrorBox.tsx';
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

function AppQueryProvider({ children }: PropsWithChildren) {
	const { showToast } = useToast();
	const [queryClient] = useState(
		() =>
			new QueryClient({
				queryCache: new QueryCache({
					onError: (error: Error) => {
						showToast(`Something went wrong: ${error.message}`, 'error');
					},
				}),
			}),
	);
	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

// Catches anything a page throws so the whole app doesn't go blank.
// The old one never reset, so once one page broke, every page showed "Error!" until you refreshed.
// resetKeys clears it every time the route changes, so leaving a broken page fixes it.
// QueryErrorResetBoundary makes Retry actually refetch, not just re-render the same error.
function RouteErrorBoundary({ children }: PropsWithChildren) {
	const location = useLocation();
	return (
		<QueryErrorResetBoundary>
			{({ reset }) => (
				<ErrorBoundary
					resetKeys={[location.pathname]}
					onReset={reset}
					fallbackRender={({ resetErrorBoundary }) => (
						<MainLayout title="Error">
							<ErrorBox
								message="Something broke on this page."
								onRetry={resetErrorBoundary}
							/>
						</MainLayout>
					)}
				>
					{children}
				</ErrorBoundary>
			)}
		</QueryErrorResetBoundary>
	);
}

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL;

// biome-ignore lint/style/noNonNullAssertion: we'd want to throw anyways
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ToastProvider>
			<AppQueryProvider>
				<BrowserRouter>
					{/* Has to be inside BrowserRouter, useLocation only works in there */}
					<RouteErrorBoundary>
						<Routes>
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
						</Routes>
					</RouteErrorBoundary>
				</BrowserRouter>
			</AppQueryProvider>
		</ToastProvider>
	</StrictMode>,
);
