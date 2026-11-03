import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsUpDown, KeyRound, LogIn, LogOut } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDispatch } from 'react-redux';
import { toast } from 'sonner';
import { useChangePasswordMutation, useLogoutMutation } from '@/app/api/authApi';
import { apiSlice } from '@/app/api/apiSlice';
import { Button } from '@/shared/components/ui/button';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/shared/components/ui/sidebar';
import { useAuth, authErrorMessage, loginPath } from '@/shared/hooks/useAuth';

const passwordSchema = z.object({
    current_password: z.string().min(1, 'Enter your current password.'),
    new_password: z.string().min(8, 'Use at least 8 characters.').max(128, 'Use at most 128 characters.'),
    confirm_password: z.string().min(1, 'Confirm your new password.'),
}).superRefine((values, context) => {
    if (values.new_password === values.current_password) {
        context.addIssue({ code: 'custom', path: ['new_password'], message: 'New password must be different from the current one.' });
    }
    if (values.confirm_password !== values.new_password) {
        context.addIssue({ code: 'custom', path: ['confirm_password'], message: 'Passwords do not match.' });
    }
});

const passwordFields = [
    { name: 'current_password', label: 'Current password', autoComplete: 'current-password' },
    { name: 'new_password', label: 'New password', autoComplete: 'new-password' },
    { name: 'confirm_password', label: 'Confirm new password', autoComplete: 'new-password' },
];

export default function NavUser() {
    const { user, isLoading, isGuest } = useAuth();
    const [logout, { isLoading: loggingOut }] = useLogoutMutation();
    const [changePassword, { isLoading: changingPassword }] = useChangePasswordMutation();
    const [passwordOpen, setPasswordOpen] = useState(false);
    const form = useForm({
        resolver: zodResolver(passwordSchema),
        defaultValues: { current_password: '', new_password: '', confirm_password: '' },
    });
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

    function handlePasswordOpenChange(open) {
        if (changingPassword) return;
        setPasswordOpen(open);
        if (!open) form.reset();
    }

    async function handleChangePassword(values) {
        try {
            await changePassword({
                current_password: values.current_password,
                new_password: values.new_password,
            }).unwrap();
            toast.success('Password changed.');
            setPasswordOpen(false);
            form.reset();
        } catch (error) {
            const detail = error?.data?.detail;
            if (error?.status === 400 && detail?.code === 'invalid_current_password') {
                form.setError('current_password', { type: 'server', message: 'Current password is incorrect.' }, { shouldFocus: true });
            } else if (error?.status === 422 && detail?.code === 'password_unchanged') {
                form.setError('new_password', { type: 'server', message: 'New password must be different from the current one.' }, { shouldFocus: true });
            } else if (error?.status === 422 && Array.isArray(detail)) {
                const issue = detail.find(({ loc }) => loc?.at(-1) === 'new_password');
                if (issue) {
                    form.setError('new_password', { type: 'server', message: String(issue.msg) }, { shouldFocus: true });
                } else {
                    form.setError('root.server', { message: 'Could not change your password. Please try again.' });
                }
            } else {
                form.setError('root.server', {
                    message: error?.status === 429
                        ? 'Too many attempts. Try again in a few minutes.'
                        : error?.status === 401
                          ? 'Your session expired. Please log in again.'
                          : 'Could not change your password. Please try again.',
                });
            }
        }
    }

    return (
        <SidebarMenu><SidebarMenuItem><Dialog open={passwordOpen} onOpenChange={handlePasswordOpenChange}><DropdownMenu>
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
                {!isGuest && <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
                    <KeyRound className="mr-2 size-4" /> Change password
                </DropdownMenuItem>}
                <DropdownMenuItem onSelect={handleLogout} disabled={loggingOut}>
                    <LogOut className="mr-2 size-4" /> Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
            {!isGuest && <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Change password</DialogTitle>
                    <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleChangePassword, (errors) => {
                        const firstInvalid = passwordFields.find(({ name }) => errors[name]);
                        if (firstInvalid) form.setFocus(firstInvalid.name);
                    })} className="space-y-4">
                        {passwordFields.map(({ name, label, autoComplete }) => (
                            <FormField key={name} control={form.control} name={name} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{label}</FormLabel>
                                    <FormControl><Input type="password" autoComplete={autoComplete} disabled={changingPassword} {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        ))}
                        {form.formState.errors.root?.server && <p role="alert" className="text-sm font-medium text-destructive">
                            {form.formState.errors.root.server.message}
                        </p>}
                        <DialogFooter>
                            <Button type="button" variant="outline" disabled={changingPassword} onClick={() => handlePasswordOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={changingPassword}>{changingPassword ? 'Changing password...' : 'Change password'}</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>}
        </Dialog></SidebarMenuItem></SidebarMenu>
    );
}
