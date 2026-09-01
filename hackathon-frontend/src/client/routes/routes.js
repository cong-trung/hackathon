import { lazy } from 'react';
import {
    HomeIcon,
    ComputerIcon,
    MessageCircleQuestionMarkIcon,
    UserSearchIcon,
    FileSpreadsheetIcon,
    MonitorCloudIcon,
    Table2Icon,
    TablePropertiesIcon,
} from 'lucide-react';
import roboticArmIcon from '@/shared/assets/icons/RoboticArmIcon';

import { routesConfig } from './constants';

export const routes = [
    // {
    //     route_name: routesConfig.homepage,
    //     key: 'homepage',
    //     title: 'Homepage',
    //     icon: HomeIcon,
    //     breadcrumb: ['Homepage'],
    //     component: lazy(() => import('@/features/home/pages/HomePage')),
    // },
    {
        title: 'TI',
        key: 'ti_page',
        icon: ComputerIcon,
        breadcrumb: ['TI'],
        children: [
            {
                route_name: routesConfig.ti_page.sthi,
                key: 'sthi',
                title: 'STHI',
                icon: ComputerIcon,
                breadcrumb: ['TI', 'STHI'],
                component: lazy(
                    () => import('@/features/ti/sthi/pages/STHIPage'),
                ),
            },
            {
                route_name: routesConfig.ti_page.lcbi,
                key: 'lcbi',
                title: 'LCBI',
                icon: MonitorCloudIcon,
                breadcrumb: ['TI', 'LCBI'],
                component: lazy(
                    () => import('@/features/ti/lcbi/pages/LCBIPage'),
                ),
            },
        ],
    },
    {
        title: 'PdO',
        key: 'pdo_page',
        icon: FileSpreadsheetIcon,
        breadcrumb: ['PdO'],
        children: [
            {
                route_name: routesConfig.pdo_page.sthi,
                key: 'pdo-sthi',
                title: 'STHI',
                icon: ComputerIcon,
                breadcrumb: ['PdO', 'STHI'],
                component: lazy(
                    () => import('@/features/pdo/sthi/pages/STHIPage'),
                ),
            },
            {
                route_name: routesConfig.pdo_page.lcbi,
                key: 'pdo-lcbi',
                title: 'LCBI',
                icon: MonitorCloudIcon,
                breadcrumb: ['PdO', 'LCBI'],
                component: lazy(
                    () => import('@/features/pdo/lcbi/pages/LCBIPage'),
                ),
            },
        ],
    },
    {
        title: 'GL-MQR',
        key: 'gl_mqr_page',
        icon: FileSpreadsheetIcon,
        breadcrumb: ['GL-MQR'],
        children: [
            {
                route_name: routesConfig.gl_mqr_page.sthi,
                key: 'gl-mqr-sthi',
                title: 'STHI',
                icon: ComputerIcon,
                breadcrumb: ['GL-MQR', 'STHI'],
                component: lazy(
                    () => import('@/features/gl-mqr/sthi/pages/STHIPage'),
                ),
            },
            {
                route_name: routesConfig.gl_mqr_page.lcbi,
                key: 'gl-mqr-lcbi',
                title: 'LCBI',
                icon: MonitorCloudIcon,
                breadcrumb: ['GL-MQR', 'LCBI'],
                component: lazy(
                    () => import('@/features/gl-mqr/lcbi/pages/LCBIPage'),
                ),
            },
        ],
    },
    {
        route_name: routesConfig.chat_page,
        key: 'chat_page',
        title: 'Chat',
        icon: MessageCircleQuestionMarkIcon,
        breadcrumb: ['Chat'],
        component: lazy(() => import('@/features/chatbot/pages/ChatBotPage')),
    },
];
