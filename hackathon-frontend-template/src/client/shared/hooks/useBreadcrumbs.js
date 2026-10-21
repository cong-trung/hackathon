import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { routes } from '@/routes/routes';

/**
 * Custom hook for generating breadcrumb navigation based on current route
 * @returns {Array} Array of breadcrumb items with label and path
 */
export default function useBreadcrumbs() {
    const { pathname } = useLocation();

    return useMemo(() => {
        // Special case: homepage
        if (pathname === '/') {
            // Try to find the root route in the static config
            const rootRoute = routes.find((r) => r.route_name === '/');
            if (rootRoute && rootRoute.breadcrumb) {
                return rootRoute.breadcrumb.map((label) => ({
                    label,
                    path: '/',
                    key: 'home',
                }));
            }
            // Fallback default
            return [{ label: 'Homepage', path: '/', key: 'home' }];
        }

        // Helper to traverse the route config tree and build the breadcrumb trail
        function findBreadcrumbTrail(routesArr, pathname, trail = []) {
            for (const route of routesArr) {
                if (route.route_name === pathname) {
                    return [...trail, route];
                }
                if (route.children) {
                    const found = findBreadcrumbTrail(
                        route.children,
                        pathname,
                        [...trail, route],
                    );
                    if (found) return found;
                }
            }
            return null;
        }

        const breadcrumbTrail = findBreadcrumbTrail(routes, pathname);
        if (breadcrumbTrail && breadcrumbTrail.length > 0) {
            // Only use routes that have a breadcrumb array (skip root nodes without breadcrumb)
            return breadcrumbTrail
                .filter(
                    (r) =>
                        Array.isArray(r.breadcrumb) && r.breadcrumb.length > 0,
                )
                .map((r) => {
                    // Use the last label in the breadcrumb array for this route
                    const label = r.breadcrumb[r.breadcrumb.length - 1];
                    return {
                        label,
                        path: r.route_name || '/',
                        key: r.key || `crumb-${label}`,
                    };
                });
        }
        return [];
    }, [pathname]);
}
