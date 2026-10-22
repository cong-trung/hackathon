import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsUpDown, LogIn, LogOut } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { toast } from 'sonner';
import { useLogoutMutation } from '@/app/api/authApi';
import { apiSlice } from '@/app/api/apiSlice';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/shared/components/ui/sidebar';
import { useAuth, authErrorMessage, loginPath } from '@/shared/hooks/useAuth';

export default function NavUser() {
    const { user, isLoading } = useAuth();
    const [logout, { isLoading: loggingOut }] = useLogoutMutation();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    if (isLoading) return null;
    if (!user) return (
        <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton asChild tooltip="Log in">
                <Link to={loginPath(location.pathname + location.search)}><LogIn /><span>Log in</span></Link>
            </SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton asChild tooltip="Request account">
                <Link to="/request-account"><span>Request account</span></Link>
            </SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu>
    );

    async function handleLogout() {
        try {
            await logout().unwrap();
            dispatch(apiSlice.util.resetApiState());
            navigate('/login', { replace: true });
        } catch (error) {
            toast.error(authErrorMessage(error));
        }
    }

    return (
        <SidebarMenu><SidebarMenuItem><DropdownMenu>
            <DropdownMenuTrigger asChild><SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                <span className="grid size-8 shrink-0 place-items-center rounded bg-sidebar-accent font-semibold">
                    {user.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 text-left text-sm">
                    <span className="block truncate font-semibold">{user.display_name}</span>
                    <span className="block capitalize text-xs text-muted-foreground">{user.role}</span>
                </span>
                <ChevronsUpDown className="size-4" />
            </SidebarMenuButton></DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="min-w-48">
                <DropdownMenuItem onSelect={handleLogout} disabled={loggingOut}>
                    <LogOut className="mr-2 size-4" /> Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu></SidebarMenuItem></SidebarMenu>
    );
}
