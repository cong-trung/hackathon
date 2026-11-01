import { lazy } from 'react';
import {
    MessageCircleQuestionMarkIcon,
    TablePropertiesIcon,
    ListChecksIcon,
    Grid3x3Icon,
    UsersIcon,
    HomeIcon,
} from 'lucide-react';

import { routesConfig } from './constants';

export const routes = [
    {
        route_name: routesConfig.homepage,
        key: 'home',
        title: 'Home',
        icon: HomeIcon,
        breadcrumb: ['Home'],
        component: lazy(() => import('@/features/home/pages/HomePage')),
    },
    {
        route_name: routesConfig.admin_users,
        key: 'admin-users', title: 'Users', icon: UsersIcon, adminOnly: true,
        component: lazy(() => import('@/features/auth/pages/UsersPage')),
    },
    // {
    //     route_name: routesConfig.homepage,
    //     key: 'homepage',
    //     title: 'Homepage',
    //     icon: HomeIcon,
    //     breadcrumb: ['Homepage'],
    //     component: lazy(() => import('@/features/home/pages/HomePage')),
    // },
    // {
    //     title: 'TI',
    //     key: 'ti_page',
    //     icon: ComputerIcon,
    //     breadcrumb: ['TI'],
    //     children: [
    //         {
    //             route_name: routesConfig.ti_page.sthi,
    //             key: 'sthi',
    //             title: 'STHI',
    //             icon: ComputerIcon,
    //             breadcrumb: ['TI', 'STHI'],
    //             component: lazy(
    //                 () => import('@/features/ti/sthi/pages/STHIPage'),
    //             ),
    //         },
    //         {
    //             route_name: routesConfig.ti_page.lcbi,
    //             key: 'lcbi',
    //             title: 'LCBI',
    //             icon: MonitorCloudIcon,
    //             breadcrumb: ['TI', 'LCBI'],
    //             component: lazy(
    //                 () => import('@/features/ti/lcbi/pages/LCBIPage'),
    //             ),
    //         },
    //     ],
    // },
    // {
    //     title: 'PdO',
    //     key: 'pdo_page',
    //     icon: FileSpreadsheetIcon,
    //     breadcrumb: ['PdO'],
    //     children: [
    //         {
    //             route_name: routesConfig.pdo_page.sthi,
    //             key: 'pdo-sthi',
    //             title: 'STHI',
    //             icon: ComputerIcon,
    //             breadcrumb: ['PdO', 'STHI'],
    //             component: lazy(
    //                 () => import('@/features/pdo/sthi/pages/STHIPage'),
    //             ),
    //         },
    //         {
    //             route_name: routesConfig.pdo_page.lcbi,
    //             key: 'pdo-lcbi',
    //             title: 'LCBI',
    //             icon: MonitorCloudIcon,
    //             breadcrumb: ['PdO', 'LCBI'],
    //             component: lazy(
    //                 () => import('@/features/pdo/lcbi/pages/LCBIPage'),
    //             ),
    //         },
    //     ],
    // },
    // {
    //     title: 'GL-MQR',
    //     key: 'gl_mqr_page',
    //     icon: FileSpreadsheetIcon,
    //     breadcrumb: ['GL-MQR'],
    //     children: [
    //         {
    //             route_name: routesConfig.gl_mqr_page.sthi,
    //             key: 'gl-mqr-sthi',
    //             title: 'STHI',
    //             icon: ComputerIcon,
    //             breadcrumb: ['GL-MQR', 'STHI'],
    //             component: lazy(
    //                 () => import('@/features/gl-mqr/sthi/pages/STHIPage'),
    //             ),
    //         },
    //         {
    //             route_name: routesConfig.gl_mqr_page.lcbi,
    //             key: 'gl-mqr-lcbi',
    //             title: 'LCBI',
    //             icon: MonitorCloudIcon,
    //             breadcrumb: ['GL-MQR', 'LCBI'],
    //             component: lazy(
    //                 () => import('@/features/gl-mqr/lcbi/pages/LCBIPage'),
    //             ),
    //         },
    //     ],
    // },
    {
        route_name: routesConfig.product_info_page,
        key: 'product_info_page',
        title: 'Product Info',
        icon: TablePropertiesIcon,
        breadcrumb: ['Product Info'],
        component: lazy(
            () => import('@/features/productInfo/components/PYPCSMatrixTab'),
        ),
    },
    {
        route_name: routesConfig.actionable_items_page,
        key: 'actionable_items_page',
        title: 'Actionable Items',
        icon: ListChecksIcon,
        breadcrumb: ['Actionable Items'],
        component: lazy(() => import('@/features/actionableItems/pages/ActionableItemsPage')),
    },
    {
        route_name: routesConfig.quality_product_matrix_page,
        key: 'quality_product_matrix_page',
        title: 'Quality Product Matrix',
        icon: Grid3x3Icon,
        breadcrumb: ['Quality Product Matrix'],
        component: lazy(() => import('@/features/qualityProductMatrix/pages/QualityProductMatrixPage')),
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
