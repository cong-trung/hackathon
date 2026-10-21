import { memo } from 'react';
import { Link } from 'react-router-dom';

import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/shared/components/ui/sidebar';

import { useTheme } from '@/shared/components/theme-provider/theme-provider';

function NavLogo() {
    const { theme } = useTheme();
    // Default to light if theme is system or undefined
    const isDark = theme === 'dark';
    const logoSrc = isDark ? '/intel_light.png' : '/intel_dark.png';
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                    <Link to="/">
                        <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                            <img
                                src={logoSrc}
                                alt="Intel Logo"
                                className="size-8 rounded-lg"
                            />
                        </div>
                        <div className="flex flex-col gap-0.5 leading-none">
                            <span>Quality Matrix</span>
                        </div>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

export default memo(NavLogo);
