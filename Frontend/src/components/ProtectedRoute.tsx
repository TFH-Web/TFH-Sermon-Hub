import { useIsAuthenticated } from '@azure/msal-react';
import { Navigate, Outlet } from 'react-router';

export default function ProtectedRoute() {
    const isAuthenticated = useIsAuthenticated();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}