import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useCreateSessionMutation, useLogoutMutation } from '@/app/api/authApi';
import { apiSlice } from '@/app/api/apiSlice';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { routesConfig } from '@/routes/constants';
import { fetchOlbProfile, profileSchema } from '@/features/auth/olbProfile';

const olbLoginEnabled = import.meta.env.VITE_OLB_LOGIN_ENABLED === 'true';
const fallbackMessage = "OLB+ couldn't share your profile with this app yet. Enter your details to continue.";
let pendingLogout;

export default function LoginPage() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [logout] = useLogoutMutation();
    const [createSession, { isLoading: isCreating }] = useCreateSessionMutation();
    const [clearing, setClearing] = useState(true);
    const [clearError, setClearError] = useState(false);
    const [fetchingProfile, setFetchingProfile] = useState(false);
    const [manual, setManual] = useState(!olbLoginEnabled);
    const [message, setMessage] = useState('');
    const form = useForm({
        resolver: zodResolver(profileSchema),
        defaultValues: { name: '', wwid: '', email: '' },
    });
    const { setFocus } = form;
    const next = searchParams.get('next');
    const destination = next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
        ? next : routesConfig.pypcs_page;

    const clearSession = useCallback(async () => {
        setClearing(true);
        setClearError(false);
        dispatch(apiSlice.util.resetApiState());
        try {
            if (!pendingLogout) {
                pendingLogout = logout().unwrap().finally(() => { pendingLogout = null; });
            }
            await pendingLogout;
        } catch {
            setClearError(true);
            setMessage('Could not clear the previous session. Please retry.');
        } finally {
            setClearing(false);
        }
    }, [dispatch, logout]);

    useEffect(() => {
        void clearSession();
    }, [clearSession]);

    useEffect(() => {
        if (manual && !clearing && !clearError) setFocus('name');
    }, [manual, clearing, clearError, setFocus]);

    const pending = clearing || clearError || fetchingProfile || isCreating;

    async function signInWithOlb() {
        if (!olbLoginEnabled) return;
        setFetchingProfile(true);
        setMessage('');
        try {
            const profile = await fetchOlbProfile();
            await createSession({ ...profile, source: 'olb' }).unwrap();
            navigate(destination, { replace: true });
        } catch {
            setMessage(fallbackMessage);
            setManual(true);
        } finally {
            setFetchingProfile(false);
        }
    }

    async function submitManual(values) {
        setMessage('');
        try {
            await createSession({ ...values, source: 'manual' }).unwrap();
            navigate(destination, { replace: true });
        } catch (error) {
            const fields = error?.status === 400 ? error.data?.fields : null;
            if (Array.isArray(fields) && fields.length) {
                const firstField = fields.find((field) => ['name', 'wwid', 'email'].includes(field));
                fields.forEach((field) => {
                    if (['name', 'wwid', 'email'].includes(field)) {
                        form.setError(field, { type: 'server', message: `Check your ${field}.` });
                    }
                });
                if (firstField) form.setFocus(firstField);
            }
            setMessage('Could not sign in. Check your details and try again.');
        }
    }

    function showManual() {
        setMessage('');
        setManual(true);
    }

    return (
        <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
            <Card className="w-full max-w-md rounded-md">
                <CardHeader>
                    <CardTitle><h1 className="text-xl">{olbLoginEnabled ? 'Quality Matrix' : 'Sign in'}</h1></CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {olbLoginEnabled ? (
                        <Button type="button" className="w-full" onClick={signInWithOlb} disabled={pending}>
                            {clearing ? 'Preparing sign in...' : fetchingProfile ? 'Connecting to OLB+...' : 'Sign in with OLB+'}
                        </Button>
                    ) : (
                        <p className="text-sm text-muted-foreground">Enter your name, WWID and Intel email.</p>
                    )}
                    <p aria-live="polite" className="text-sm text-foreground">{message}</p>
                    {clearError && (
                        <Button type="button" variant="outline" onClick={clearSession} disabled={clearing}>
                            Retry session reset
                        </Button>
                    )}
                    {olbLoginEnabled && !manual && (
                        <Button type="button" variant="link" className="h-auto p-0" onClick={showManual} disabled={pending}>
                            Enter details manually
                        </Button>
                    )}
                    {manual && (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(submitManual, (errors) => {
                                const firstField = ['name', 'wwid', 'email'].find((field) => errors[field]);
                                if (firstField) form.setFocus(firstField);
                            })} className="space-y-4" noValidate>
                                {['name', 'wwid', 'email'].map((name) => (
                                    <FormField key={name} control={form.control} name={name} render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{name === 'wwid' ? 'WWID' : name === 'email' ? 'Email' : 'Name'}</FormLabel>
                                            <FormControl>
                                                <Input {...field} required disabled={pending}
                                                    inputMode={name === 'wwid' ? 'numeric' : undefined}
                                                    type={name === 'email' ? 'email' : 'text'}
                                                    autoComplete={name === 'email' ? 'email' : name === 'name' ? 'name' : 'off'} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                ))}
                                <Button type="submit" className="w-full" disabled={pending}>
                                    {isCreating ? 'Signing in...' : 'Continue'}
                                </Button>
                            </form>
                        </Form>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}