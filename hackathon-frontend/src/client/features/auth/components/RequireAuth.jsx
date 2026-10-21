import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useGetMeQuery } from '@/app/api/authApi';
import { routesConfig } from '@/routes/constants';

export default function RequireAuth() {
    const location = useLocation();
    const { data, error, isLoading } = useGetMeQuery();

    if (isLoading) {
        return <div className="flex min-h-dvh items-center justify-center" role="status">Loading session...</div>;
    }

    if (error?.status === 401 || !data?.user && !error) {
        const next = location.pathname + location.search;
        return <Navigate to={`${routesConfig.login}?next=${encodeURIComponent(next)}`} replace />;
    }

    if (error) {
        return <div className="flex min-h-dvh items-center justify-center p-4" role="alert">Could not verify your session. Please refresh to try again.</div>;
    }

    return <Outlet />;
}