import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, AtSign, CheckCircle2, LockKeyhole, UserRound } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { apiSlice } from '@/app/api/apiSlice';
import { useLoginMutation, useRequestAccountMutation } from '@/app/api/authApi';
import { routesConfig } from '@/routes/constants';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { authErrorMessage, useAuth } from '@/shared/hooks/useAuth';
import loginIllustration from '@/shared/assets/images/auth-login-illustration.svg';
import signupIllustration from '@/shared/assets/images/auth-signup-illustration.svg';

const loginSchema = z.object({
    username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9._-]+$/),
    password: z.string().min(8).max(128),
});

const requestSchema = z.object({
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

const inputClassName = 'h-11 border-0 bg-[#1f2029] pl-11 pr-4 text-[#f4f3f5] shadow-inner shadow-black/10 placeholder:text-[#c4c3ca] placeholder:transition-opacity focus:placeholder:opacity-80 focus-visible:ring-2 focus-visible:ring-[#ffeba7] md:text-sm';
const actionClassName = 'inline-flex min-h-11 items-center justify-center rounded bg-[#ffeba7] px-6 text-xs font-bold uppercase tracking-widest text-[#102770] shadow-lg shadow-black/20 transition-colors hover:bg-[#102770] hover:text-[#ffeba7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffeba7] disabled:cursor-not-allowed disabled:opacity-60';

const loginBrandPoints = [
    'Track products, questions and answers',
    'Review and finalize quality decisions',
    'Export the action plan when you are done',
];

const signupBrandPoints = [
    'Request editor or reviewer access',
    'Admins review every new account',
    'Start editing once you are approved',
];

function BrandPanel({ eyebrow, headline, sub, points, illustration }) {
    return (
        <aside aria-hidden="true" className="auth-brand">
            <div className="relative flex flex-col items-start gap-5 px-8 pt-9">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#ffeba7]/90">{eyebrow}</p>
                <h2 className="text-3xl font-bold leading-tight text-[#f4f3f5]">{headline}</h2>
                <p className="text-sm leading-6 text-[#c4c3ca]">{sub}</p>
                <ul className="flex flex-col gap-2.5 text-sm text-[#c4c3ca]">
                    {points.map((point) => (
                        <li key={point} className="flex items-start gap-2">
                            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#ffeba7]" />
                            <span>{point}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <img src={illustration} alt="" className="auth-brand__art" draggable={false} />
        </aside>
    );
}

function AuthField({ form, name, label, autoComplete, icon: Icon, type = 'text', inputRef }) {
    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem className="space-y-1.5">
                    <FormLabel className="sr-only">{label}</FormLabel>
                    <div className="relative">
                        <Icon aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 h-5 w-5 text-[#ffeba7]" />
                        <FormControl>
                            <Input
                                {...field}
                                ref={(node) => {
                                    field.ref(node);
                                    if (inputRef) inputRef.current = node;
                                }}
                                type={type}
                                autoComplete={autoComplete}
                                placeholder={label}
                                className={inputClassName}
                                onChange={(event) => field.onChange(name === 'username' ? event.target.value.toLowerCase() : event.target.value)}
                            />
                        </FormControl>
                    </div>
                    <FormMessage className="text-[#ffb4ad]" />
                </FormItem>
            )}
        />
    );
}

export default function LoginPage() {
    const { pathname } = useLocation();
    const isSignUp = pathname === routesConfig.request_account;
    const [params] = useSearchParams();
    const next = params.get('next');
    const query = next !== null ? `?next=${encodeURIComponent(next)}` : '';
    const destination = next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') &&
        !/[\r\n]/.test(next) ? next : routesConfig.homepage;
    const { isAuthenticated, isLoading } = useAuth();
    const [login, { isLoading: loggingIn }] = useLoginMutation();
    const [requestAccount, { isLoading: requesting }] = useRequestAccountMutation();
    const [loginError, setLoginError] = useState('');
    const [requestError, setRequestError] = useState('');
    const [complete, setComplete] = useState(false);
    const loginFirstRef = useRef(null);
    const requestFirstRef = useRef(null);
    const successRef = useRef(null);
    const previousPath = useRef(pathname);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const loginForm = useForm({
        resolver: zodResolver(loginSchema),
        defaultValues: { username: '', password: '' },
    });
    const requestForm = useForm({
        resolver: zodResolver(requestSchema),
        defaultValues: { username: '', display_name: '', email: '', password: '', confirm: '' },
    });

    useEffect(() => {
        if (previousPath.current !== pathname && !isLoading && !isAuthenticated) {
            (isSignUp ? (complete ? successRef : requestFirstRef) : loginFirstRef).current?.focus();
        }
        previousPath.current = pathname;
    }, [pathname, isSignUp, complete, isLoading, isAuthenticated]);

    useEffect(() => {
        if (complete && isSignUp) successRef.current?.focus();
    }, [complete, isSignUp]);

    function switchTo(signUp) {
        navigate(`${signUp ? routesConfig.request_account : routesConfig.login}${query}`, { replace: true });
    }

    async function onLogin(values) {
        setLoginError('');
        try {
            await login(values).unwrap();
            dispatch(apiSlice.util.resetApiState());
            navigate(destination, { replace: true });
        } catch (failure) {
            setLoginError(authErrorMessage(failure));
        }
    }

    async function onRequest(values) {
        setRequestError('');
        try {
            await requestAccount({
                username: values.username,
                display_name: values.display_name,
                password: values.password,
                ...(values.email ? { email: values.email } : {}),
            }).unwrap();
            setComplete(true);
        } catch (failure) {
            setRequestError(authErrorMessage(failure));
        }
    }

    if (isLoading) {
        return <main className="flex min-h-dvh items-center justify-center bg-[#1f2029] text-[#c4c3ca]" role="status">Checking session...</main>;
    }
    if (isAuthenticated) return <Navigate to={destination} replace />;

    return (
        <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#14161f] px-4 py-10 text-[#c4c3ca]">
            <div aria-hidden="true" className="auth-aurora">
                <span className="auth-grid" />
                <span className="auth-orb auth-orb--one" />
                <span className="auth-orb auth-orb--two" />
                <span className="auth-orb auth-orb--three" />
                <span className="auth-spark auth-spark--a" />
                <span className="auth-spark auth-spark--b" />
                <span className="auth-spark auth-spark--c" />
                <span className="auth-spark auth-spark--d" />
                <span className="auth-spark auth-spark--e" />
                <span className="auth-spark auth-spark--f" />
            </div>

            <div className="relative z-10 w-full max-w-[880px]">
                <Link to={routesConfig.homepage} className="mb-8 inline-flex items-center gap-2 text-sm text-[#c4c3ca] underline-offset-4 hover:text-[#ffeba7] hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffeba7]">
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to app
                </Link>
                <header className="mb-8 text-center">
                    <h1 className="flex items-center justify-center gap-7 text-xl font-bold uppercase tracking-widest sm:gap-10 sm:text-2xl">
                        <span className={isSignUp ? 'text-[#c4c3ca]' : 'text-[#ffeba7]'}>Log In</span>
                        <span className={isSignUp ? 'text-[#ffeba7]' : 'text-[#c4c3ca]'}>Sign Up</span>
                    </h1>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#9b9aab]">
                        A tool for capturing and reviewing product quality data across the matrix.
                    </p>
                    <button
                        type="button"
                        role="switch"
                        aria-label="Sign up instead of log in"
                        aria-checked={isSignUp}
                        onClick={() => switchTo(!isSignUp)}
                        className="mt-6 inline-flex h-10 w-20 items-center rounded-full bg-[#ffeba7] p-1 text-[#102770] shadow-lg shadow-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffeba7]"
                    >
                        <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-[#102770] text-[#ffeba7] transition-transform duration-500 motion-reduce:transition-none ${isSignUp ? 'translate-x-10 rotate-180' : ''}`}>
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </span>
                    </button>
                </header>

                <div className="auth-card">
                    <div className={`auth-card-inner ${isSignUp ? 'auth-card-inner--flipped' : ''}`}>
                        <section
                            aria-hidden={isSignUp}
                            inert={isSignUp ? '' : undefined}
                            className="auth-face auth-face--front grid min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#262733] shadow-2xl shadow-black/50 md:min-h-[500px] md:grid-cols-[5fr_6fr]"
                        >
                            <BrandPanel eyebrow="Quality Matrix" headline="Welcome back" sub="Sign in to capture, review and finalize product quality data." points={loginBrandPoints} illustration={loginIllustration} />
                            <div className="flex flex-col justify-center bg-[#23252f]/95 px-6 py-10 sm:px-10">
                                <h2 className="mb-1 text-center text-2xl font-semibold text-[#f4f3f5] md:text-left">Log In</h2>
                                <p className="mb-7 text-center text-sm text-[#c4c3ca] md:text-left">Use your approved account to edit.</p>
                                <Form {...loginForm}>
                                    <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" noValidate>
                                        <AuthField form={loginForm} name="username" label="Username" autoComplete="username" icon={UserRound} inputRef={loginFirstRef} />
                                        <AuthField form={loginForm} name="password" label="Password" type="password" autoComplete="current-password" icon={LockKeyhole} />
                                        {loginError && <p role="alert" className="text-sm text-[#ffb4ad]">{loginError}</p>}
                                        <button type="submit" disabled={loggingIn} className={`${actionClassName} w-full`}>{loggingIn ? 'Logging in...' : 'Log In'}</button>
                                    </form>
                                </Form>
                                <button type="button" onClick={() => switchTo(true)} className="mt-6 text-center text-sm text-[#ffeba7] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffeba7]">Need access? Request an account</button>
                            </div>
                        </section>

                        <section
                            aria-hidden={!isSignUp}
                            inert={!isSignUp ? '' : undefined}
                            className="auth-face auth-face--back grid min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#262733] shadow-2xl shadow-black/50 md:min-h-[500px] md:grid-cols-[5fr_6fr]"
                        >
                            <BrandPanel eyebrow="Quality Matrix" headline="Join the team" sub="Request an approved account to start contributing to the quality matrix." points={signupBrandPoints} illustration={signupIllustration} />
                            <div className="flex flex-col justify-center bg-[#23252f]/95 px-6 py-10 sm:px-10">
                                {complete ? (
                                    <div role="status" className="space-y-5 text-center">
                                        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#ffeba7]/15">
                                            <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-[#ffeba7]" />
                                        </div>
                                        <h2 className="text-2xl font-semibold text-[#f4f3f5]">Request received</h2>
                                        <p className="text-sm leading-6 text-[#c4c3ca]">An admin must approve your account before you can log in and edit.</p>
                                        <button ref={successRef} type="button" onClick={() => switchTo(false)} className={`${actionClassName} w-full`}>Log In</button>
                                    </div>
                                ) : (
                                    <>
                                        <h2 className="mb-1 text-center text-2xl font-semibold text-[#f4f3f5] md:text-left">Sign Up</h2>
                                        <p className="mb-6 text-center text-sm leading-6 text-[#c4c3ca] md:text-left">Request access. An admin reviews new accounts before editing is enabled.</p>
                                        <Form {...requestForm}>
                                            <form onSubmit={requestForm.handleSubmit(onRequest)} className="space-y-3" noValidate>
                                                <AuthField form={requestForm} name="username" label="Username" autoComplete="username" icon={UserRound} inputRef={requestFirstRef} />
                                                <AuthField form={requestForm} name="display_name" label="Display name" autoComplete="name" icon={UserRound} />
                                                <AuthField form={requestForm} name="email" label="Email (optional)" type="email" autoComplete="email" icon={AtSign} />
                                                <AuthField form={requestForm} name="password" label="Password" type="password" autoComplete="new-password" icon={LockKeyhole} />
                                                <AuthField form={requestForm} name="confirm" label="Confirm password" type="password" autoComplete="new-password" icon={LockKeyhole} />
                                                {requestError && <p role="alert" className="text-sm text-[#ffb4ad]">{requestError}</p>}
                                                <button type="submit" disabled={requesting} className={`${actionClassName} mt-2 w-full`}>{requesting ? 'Sending...' : 'Request account'}</button>
                                            </form>
                                        </Form>
                                        <button type="button" onClick={() => switchTo(false)} className="mt-6 text-center text-sm text-[#ffeba7] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffeba7]">Already approved? Log in</button>
                                    </>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
