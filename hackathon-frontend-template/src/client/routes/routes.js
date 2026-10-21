import { lazy } from 'react';
import { Home } from 'lucide-react';

import { routesConfig } from './constants';

export const routes = [
    {
        route_name: routesConfig.homepage,
        key: 'homepage',
        title: 'Home',
        icon: Home,
        breadcrumb: ['Home'],
        component: lazy(() => import('@/features/home/pages/HomePage')),
    },
];
