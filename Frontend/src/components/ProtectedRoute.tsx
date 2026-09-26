import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { Navigate, Outlet } from 'react-router';

const isTestMode = import.meta.env.VITE_E2E_TEST === 'true';

export default function ProtectedRoute() {
    const isAuthenticated = useIsAuthenticated();
    const { inProgress } = useMsal();

    if (isTestMode) {
        return <Outlet />;
    }

    if (inProgress !== InteractionStatus.None) {
        return null;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}