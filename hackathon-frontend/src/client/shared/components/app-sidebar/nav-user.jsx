import { memo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, LogOut } from 'lucide-react';

import { useGetMeQuery, useLogoutMutation } from '@/app/api/authApi';
import { apiSlice } from '@/app/api/apiSlice';
import { routesConfig } from '@/routes/constants';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
    SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/shared/components/ui/sidebar';

function NavUser() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { isMobile } = useSidebar();
    const { data } = useGetMeQuery();
    const [logout, { isLoading }] = useLogoutMutation();
    const [error, setError] = useState(false);
    const user = data?.user;

    if (!user) return null;

    async function handleLogout() {
        setError(false);
        try {
            await logout().unwrap();
            dispatch(apiSlice.util.resetApiState());
            navigate(routesConfig.login, { replace: true });
        } catch {
            setError(true);
        }
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                            <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">{user.name}</span>
                                <span className="truncate text-xs text-sidebar-foreground/80">
                                    {user.wwid}{user.source === 'manual' && ' · manual'}
                                </span>
                            </span>
                            <ChevronsUpDown className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-56" side={isMobile ? 'bottom' : 'right'} align="end">
                        <DropdownMenuLabel>{user.name} ({user.wwid})</DropdownMenuLabel>
                        {error && <p role="alert" className="px-2 text-sm text-destructive">Could not log out. Try again.</p>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={isLoading} onSelect={handleLogout}>
                            <LogOut className="mr-2 size-4" />{isLoading ? 'Logging out...' : 'Log out'}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

export default memo(NavUser);
