import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { loginPath, useAuth } from '@/shared/hooks/useAuth';

export default function RequireAuth() {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <main className="flex min-h-dvh items-center justify-center bg-[#1f2029] text-[#c4c3ca]" role="status">
                Checking session...
            </main>
        );
    }

    if (!isAuthenticated) {
        return (
            <Navigate
                to={loginPath(`${location.pathname}${location.search}`)}
                replace
            />
        );
    }

    return <Outlet />;
}