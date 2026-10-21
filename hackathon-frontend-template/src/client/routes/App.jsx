import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';

import AppLayout from '@/shared/layout/AppLayout';
import { routes } from '@/routes/routes';

const NotFound = lazy(() => import('@/features/home/pages/NotFound'));

import { Agentation } from 'agentation';

const buildRouteObjects = (routeList) =>
    routeList
        .map(({ route_name, component: Component, children, ...rest }) => {
            const hasChildren = Array.isArray(children) && children.length > 0;
            const builtChildren = hasChildren
                ? buildRouteObjects(children)
                : [];

            if (!route_name) {
                if (!hasChildren) return null;

                return {
                    id: rest.key,
                    element: Component ? <Component /> : <Outlet />,
                    children: builtChildren,
                };
            }

            if (route_name === '/') {
                return {
                    index: true,
                    element: Component ? <Component /> : <Outlet />,
                    id: rest.key,
                };
            }

            return {
                id: rest.key,
                path: route_name.replace(/^\//, ''),
                element: Component ? <Component /> : <Outlet />,
                children: builtChildren.length ? builtChildren : undefined,
            };
        })
        .filter(Boolean);

const router = createBrowserRouter([
    {
        element: <AppLayout />,
        children: [
            ...buildRouteObjects(routes),
            {
                path: '*',
                element: <NotFound />,
                id: 'not-found',
            },
        ],
    },
]);

function App() {
    return (
        <>
            <Suspense fallback={null}>
                <RouterProvider router={router} />
            </Suspense>
            {import.meta.env.DEV && (
                <Agentation
                    endpoint="http://10.240.12.105:4747"
                    onSessionCreated={(sessionId) => {
                        console.log('Session started:', sessionId);
                    }}
                />
            )}
        </>
    );
}

export default App;
