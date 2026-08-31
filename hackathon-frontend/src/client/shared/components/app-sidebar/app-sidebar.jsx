import { memo } from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/shared/components/ui/sidebar';

import NavLogo from './nav-logo';
import NavMain from './nav-main';
// import NavUser from './nav-user';

/**
 * AppSidebar - Main sidebar component for application navigation
 *
 * @returns {JSX.Element} - Sidebar component
 */
function AppSidebar({ ...props }) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <NavLogo />
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarFooter>{/* <NavUser /> */}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export default memo(AppSidebar);
