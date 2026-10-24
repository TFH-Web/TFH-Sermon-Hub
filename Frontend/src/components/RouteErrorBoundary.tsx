import { QueryErrorResetBoundary } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useLocation } from 'react-router';
import ErrorBox from './ErrorBox';
import MainLayout from './MainLayout';

// Catches anything a page throws so the whole app doesn't go blank.
// The old one never reset, so once one page broke, every page showed "Error!" until you refreshed.
// resetKeys clears it every time the route changes, so leaving a broken page fixes it.
// QueryErrorResetBoundary makes Retry actually refetch, not just re-render the same error.
// The fallback sits outside ProtectedRoute, so nothing it renders may require a signed-in user.
export default function RouteErrorBoundary({ children }: PropsWithChildren) {
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
