import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useRequestAccountMutation } from '@/app/api/authApi';
import { Button } from '@/shared/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { authErrorMessage } from '@/shared/hooks/useAuth';

const schema = z.object({
    username: z.string().trim().toLowerCase().min(3, 'Use at least 3 characters.').max(32)
        .regex(/^[a-z0-9._-]+$/, 'Use lowercase letters, numbers, dots, underscores or hyphens.'),
    display_name: z.string().trim().min(1, 'Enter your name.').max(80)
        .refine((value) => !/^[=+\-@]/.test(value) && !value.includes('|'), 'Name cannot start with =, +, - or @ or contain |.'),
    email: z.union([z.literal(''), z.email().max(254)]),
    password: z.string().min(8, 'Use at least 8 characters.').max(128),
    confirm: z.string(),
}).refine((values) => values.password === values.confirm, {
    path: ['confirm'], message: 'Passwords do not match.',
});

export default function RequestAccountPage() {
    const [requestAccount, { isLoading }] = useRequestAccountMutation();
    const [error, setError] = useState('');
    const [complete, setComplete] = useState(false);
    const form = useForm({ resolver: zodResolver(schema), defaultValues: {
        username: '', display_name: '', email: '', password: '', confirm: '',
    } });

    async function onSubmit(values) {
        setError('');
        try {
            await requestAccount({ username: values.username, display_name: values.display_name,
                password: values.password, ...(values.email ? { email: values.email } : {}) }).unwrap();
            setComplete(true);
        } catch (failure) {
            setError(authErrorMessage(failure));
        }
    }

    return <main className="flex min-h-[calc(100dvh-7rem)] items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
            {complete ? <div role="status" className="space-y-3">
                <h1 className="text-2xl font-semibold">Request received</h1>
                <p>An admin must approve your account before you can log in and edit.</p>
                <Link className="inline-block underline underline-offset-4" to="/login">Back to log in</Link>
            </div> : <>
                <div><h1 className="text-2xl font-semibold">Request an account</h1>
                    <p className="mt-1 text-sm text-muted-foreground">An admin reviews new accounts before editing is enabled.</p></div>
                <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {[
                        ['username', 'Username', 'username'], ['display_name', 'Display name', 'name'],
                        ['email', 'Email (optional)', 'email'], ['password', 'Password', 'new-password'],
                        ['confirm', 'Confirm password', 'new-password'],
                    ].map(([name, label, autoComplete]) =>
                        <FormField key={name} control={form.control} name={name} render={({ field }) =>
                            <FormItem><FormLabel>{label}</FormLabel><FormControl>
                                <Input type={name === 'password' || name === 'confirm' ? 'password' : 'text'}
                                    autoComplete={autoComplete} {...field}
                                    onChange={(event) => field.onChange(name === 'username' ? event.target.value.toLowerCase() : event.target.value)} />
                            </FormControl><FormMessage /></FormItem>} />)}
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Sending...' : 'Request account'}</Button>
                </form></Form>
                <Link className="text-sm underline underline-offset-4" to="/login">Already approved? Log in</Link>
            </>}
        </div>
    </main>;
}