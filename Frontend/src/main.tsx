import 'sanitize.css';
import './index.css';

import { MsalProvider } from '@azure/msal-react';
import {
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from '@tanstack/react-query';
import axios from 'axios';
import { type PropsWithChildren, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import AIChat from './AIChat.tsx';
import AISearch from './AISearch.tsx';
import AISearchResults from './AISearchResults.tsx';
import { apiScopes, msalInstance } from './authConfig';
import AuthSession from './components/AuthSession';
import { ChatProvider } from './components/ChatContext';
import ProtectedRoute from './components/ProtectedRoute';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { ToastProvider, useToast } from './components/ToastContext';
import Dashboard from './Dashboard.tsx';
import LoginPage from './LoginPage.tsx';
import { installApiAuth } from './lib/auth';
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

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL;

installApiAuth(axios, msalInstance, apiScopes);

// biome-ignore lint/style/noNonNullAssertion: we'd want to throw anyways
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<MsalProvider instance={msalInstance}>
			<ToastProvider>
				<AppQueryProvider>
					<AuthSession>
						{/* Above the router so a chat survives route changes; inside AuthSession so it can reset with the session */}
						<ChatProvider>
							<BrowserRouter>
								{/* Has to be inside BrowserRouter, useLocation only works in there */}
								<RouteErrorBoundary>
									<Routes>
										<Route path="/login" element={<LoginPage />} />
										<Route element={<ProtectedRoute />}>
											<Route index element={<Dashboard />} />
											<Route path="/sermons" element={<Sermons />} />
											<Route path="/sermons/:id" element={<SermonDetail />} />
											<Route path="/series" element={<Series />} />
											<Route path="/speakers" element={<Speakers />} />
											<Route path="/ai-search" element={<AISearch />} />
											<Route
												path="/ai-search/results"
												element={<AISearchResults />}
											/>
											<Route path="/ai-chat" element={<AIChat />} />
											<Route path="/tags" element={<TagsAndMetadata />} />
										</Route>
										<Route element={<ProtectedRoute adminOnly />}>
											<Route path="/upload" element={<ImportUpload />} />
											<Route
												path="/user-management"
												element={<UserManagement />}
											/>
											<Route
												path="/notifications"
												element={<Notifications />}
											/>
											<Route path="/settings" element={<Settings />} />
										</Route>
									</Routes>
								</RouteErrorBoundary>
							</BrowserRouter>
						</ChatProvider>
					</AuthSession>
				</AppQueryProvider>
			</ToastProvider>
		</MsalProvider>
	</StrictMode>,
);
