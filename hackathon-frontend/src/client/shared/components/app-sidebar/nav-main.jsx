import { memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTheme } from '@/shared/components/theme-provider/theme-provider';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/shared/components/ui/sidebar';

// Route configuration
import { routes } from '@/routes/routes';

const NavMain = memo(() => {
  const location = useLocation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Active background classes
  const activeBg = isDark
    ? '!bg-white !text-black !hover:bg-white/95 !hover:text-black'
    : '!bg-black !text-white !hover:bg-black/95 !hover:text-white';

  const nonActiveHover = isDark
    ? '!hover:bg-white/10 !hover:text-white'
    : '!hover:bg-black/10 !hover:text-black';

  return (
    <SidebarGroup>
      <SidebarMenu>
        {routes
          .filter((route) => !route.hideInSidebar)
          .map((route) => {
            // If route has no children, render as simple nav item
            const path = route.route_name;
            const isActive = location.pathname === path;
            if (!route.children || route.children.length === 0) {
              return (
                <SidebarMenuItem key={route.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={route.title}
                    className={isActive ? activeBg : nonActiveHover}
                  >
                    <Link to={path}>
                      {typeof route.icon === 'function' ? (
                        <route.icon theme={theme} isActive={isActive} />
                      ) : (
                        <route.icon />
                      )}
                      <span>{route.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            }

            // If route has children, render as collapsible
            const visibleChildren = route.children.filter(
              (subRoute) => !subRoute.hideInSidebar,
            );
            if (visibleChildren.length === 0) {
              // If all children are hidden, skip rendering this parent
              return null;
            }
            // Parent is active if any child is active or itself is active
            const isParentActive =
              isActive ||
              visibleChildren.some(
                (subRoute) => location.pathname === subRoute.route_name,
              );
            return (
              <Collapsible
                key={route.title}
                asChild
                className="group/collapsible"
                defaultOpen={isParentActive}
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip={route.title}
                      isActive={isParentActive}
                    >
                      {typeof route.icon === 'function' ? (
                        <route.icon theme={theme} isActive={isParentActive} />
                      ) : (
                        <route.icon />
                      )}
                      <span>{route.title}</span>
                      <ChevronRight className="ml-auto transition-transform duration-100 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {visibleChildren.map((subRoute) => {
                        const subPath = subRoute.route_name;
                        const isSubActive = location.pathname === subPath;
                        return (
                          <SidebarMenuSubItem key={subRoute.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isSubActive}
                              className={
                                isSubActive ? activeBg : nonActiveHover
                              }
                            >
                              <Link to={subPath}>
                                {typeof subRoute.icon === 'function' ? (
                                  <subRoute.icon
                                    theme={theme}
                                    isActive={isSubActive}
                                  />
                                ) : (
                                  <subRoute.icon />
                                )}
                                <span>{subRoute.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            );
          })}
      </SidebarMenu>
    </SidebarGroup>
  );
});

NavMain.displayName = 'NavMain';

export default NavMain;
