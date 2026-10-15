import { InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { isAuthTestMode, useAuth } from '$/lib/auth';

export default function ProtectedRoute({
	adminOnly = false,
}: {
	adminOnly?: boolean;
}) {
	const { inProgress } = useMsal();
	const location = useLocation();
	const { status, roles } = useAuth();

	if (isAuthTestMode) {
		return <Outlet />;
	}

	if (inProgress !== InteractionStatus.None || status === 'loading') {
		return <p role="status">Checking your session…</p>;
	}

	if (status !== 'ready') {
		return (
			<Navigate
				to="/login"
				replace
				state={{
					returnTo: location.pathname + location.search + location.hash,
				}}
			/>
		);
	}
	if (adminOnly && !roles.includes('Admin')) return <Navigate to="/" replace />;

	return <Outlet />;
}
