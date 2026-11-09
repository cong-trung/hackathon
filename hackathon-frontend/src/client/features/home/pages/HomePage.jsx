import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    CornerDownLeft,
    MessageCircleQuestionMark,
    Rocket,
    Search,
    Sparkles,
    X,
} from 'lucide-react';

import { routes } from '@/routes/routes';
import { useAuth } from '@/shared/hooks/useAuth';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/shared/components/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/shared/components/ui/collapsible';
import { Input } from '@/shared/components/ui/input';

const LAST_ROUTE_KEY = 'qm:home:last-route';
const GUIDE_DISMISSED_KEY = 'qm:home:getting-started-dismissed';
const legacyWorkspacePaths = {
    '/pypcs': '/product-info',
    '/view-2': '/actionable-items',
    '/view-3': '/quality-product-matrix',
};

const workspaceMeta = {
    'admin-users': {
        description: 'Approve new accounts and assign roles.',
        keywords: 'users accounts admin approve roles permissions',
    },
    product_info_page: {
        description: 'Complete and submit product information by module.',
        keywords: 'product info modules questions answers submit',
    },
    actionable_items_page: {
        description: 'Capture actionable items and assign them to modules.',
        keywords: 'actionable items tasks findings modules packages',
    },
    quality_product_matrix_page: {
        description: 'Review module-specific product decisions and export the matrix.',
        keywords: 'matrix decisions review final export grid',
    },
    chat_page: {
        description: 'Ask SOPMOD about anything in the data.',
        keywords: 'chat assistant ai sopmod questions ask help',
    },
};

const accents = [
    'bg-chart-2/10 text-chart-2',
    'bg-chart-1/10 text-chart-1',
    'bg-chart-3/10 text-chart-3',
    'bg-chart-4/10 text-chart-4',
    'bg-chart-5/10 text-chart-5',
];

const accessSteps = [
    {
        title: 'Request access',
        description:
            'On the login page choose "Need access? Request an account" and send your details.',
    },
    {
        title: 'Get approved',
        description:
            'An admin reviews the request. You can sign in the moment it is approved.',
    },
    {
        title: 'Start working',
        description:
            'Pick a workspace below and go — every change is saved as you type.',
    },
];

const tips = [
    'Switch tabs from the sidebar; editing needs an approved account.',
    'Only admins can finalize submissions or manage user accounts.',
    'Changes land in the project data right away — there is no save button.',
];

function Kbd({ children }) {
    return (
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {children}
        </kbd>
    );
}

function Highlight({ text, needle }) {
    if (!needle) return text;
    const start = text.toLowerCase().indexOf(needle);
    if (start === -1) return text;
    const end = start + needle.length;
    return (
        <>
            {text.slice(0, start)}
            <mark className="rounded-sm bg-primary/20 px-0.5 text-inherit">
                {text.slice(start, end)}
            </mark>
            {text.slice(end)}
        </>
    );
}

function readStored(key) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function store(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function timeOfDayGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

export default function HomePage() {
    const { user, isAdmin } = useAuth();
    const navigate = useNavigate();
    const searchRef = useRef(null);
    const [query, setQuery] = useState('');
    const [lastRoute, setLastRoute] = useState(() =>
        legacyWorkspacePaths[readStored(LAST_ROUTE_KEY)] ?? readStored(LAST_ROUTE_KEY),
    );
    const [guideDismissed, setGuideDismissed] = useState(
        () => readStored(GUIDE_DISMISSED_KEY) === '1',
    );

    const visibleRoutes = routes.filter(
        (route) =>
            !route.hideInSidebar &&
            route.key !== 'home' &&
            (isAdmin || !route.adminOnly),
    );

    const workspaces = visibleRoutes.map((route, index) => ({
        key: route.key,
        title: route.title,
        icon: route.icon,
        path: route.route_name,
        adminOnly: route.adminOnly,
        accent: accents[index % accents.length],
        description: workspaceMeta[route.key]?.description ?? route.title,
        keywords: workspaceMeta[route.key]?.keywords ?? '',
    }));

    const needle = query.trim().toLowerCase();
    const filtered = needle
        ? workspaces.filter((workspace) =>
              `${workspace.title} ${workspace.description} ${workspace.keywords}`
                  .toLowerCase()
                  .includes(needle),
          )
        : workspaces;

    const lastWorkspace = workspaces.find(
        (workspace) => workspace.path === lastRoute,
    );
    const primaryWorkspace =
        lastWorkspace ?? workspaces.find(({ key }) => key === 'product_info_page');
    const chatWorkspace = workspaces.find(({ key }) => key === 'chat_page');
    const showGuide = !guideDismissed && !isAdmin;
    const firstName = user?.display_name?.split(' ')[0] ?? user?.username ?? '';

    useEffect(() => {
        const handler = (event) => {
            const target = event.target;
            const typing =
                target?.tagName === 'INPUT' ||
                target?.tagName === 'TEXTAREA' ||
                target?.isContentEditable;
            if (event.key === '/' && !typing) {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const rememberWorkspace = (path) => {
        store(LAST_ROUTE_KEY, path);
        setLastRoute(path);
    };

    const openWorkspace = (path) => {
        rememberWorkspace(path);
        navigate(path);
    };

    const handleSearchKeyDown = (event) => {
        if (event.key === 'Enter' && filtered.length > 0) {
            event.preventDefault();
            openWorkspace(filtered[0].path);
        }
        if (event.key === 'Escape') {
            setQuery('');
        }
    };

    return (
        <div className={cn('grid min-h-full w-full max-w-screen-2xl content-start gap-5 pb-2 lg:items-start', showGuide && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
            <header className="relative min-w-0 overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-sm lg:col-start-1">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/20 blur-3xl"
                />
                <div className="relative animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-backwards">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                        Quality Matrix
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">
                        {timeOfDayGreeting()}
                        {firstName ? `, ${firstName}` : ''}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        Capture product quality, track the action items behind
                        every finding, and ship a clear action plan — all from
                        one workspace.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        {primaryWorkspace && (
                            <Button
                                asChild
                                className="h-10 px-4"
                            >
                                <Link
                                    to={primaryWorkspace.path}
                                    onClick={() =>
                                        rememberWorkspace(primaryWorkspace.path)
                                    }
                                >
                                    {lastWorkspace
                                        ? `Continue: ${lastWorkspace.title}`
                                        : `Open the ${primaryWorkspace.title}`}
                                    <ArrowRight />
                                </Link>
                            </Button>
                        )}
                        {chatWorkspace && (
                            <Button
                                asChild
                                variant="outline"
                                className="h-10 px-4"
                            >
                                <Link to={chatWorkspace.path}>
                                    <MessageCircleQuestionMark />
                                    Ask SOPMOD
                                </Link>
                            </Button>
                        )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Badge
                            variant="secondary"
                            className="gap-1.5 px-3 py-1 text-xs"
                        >
                            <Sparkles className="size-3" aria-hidden="true" />
                            {workspaces.length} workspaces ready
                        </Badge>
                        {user?.role && (
                            <Badge
                                variant="outline"
                                className="px-3 py-1 text-xs"
                            >
                                Role: {user.role}
                            </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                            Everything autosaves as you work.
                        </span>
                    </div>
                </div>
            </header>

            <section className="flex min-w-0 flex-col gap-3 lg:col-start-1">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-backwards">
                        <h2 className="text-xl font-semibold tracking-tight">
                            Jump into a workspace
                        </h2>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                            Type to filter, press <Kbd>/</Kbd> to focus,
                            <Kbd>Enter</Kbd> opens the top match.
                        </p>
                    </div>
                    {needle && (
                        <Badge
                            variant="secondary"
                            className="px-3 py-1 text-xs"
                        >
                            {filtered.length} of {workspaces.length}{' '}
                            {filtered.length === 1 ? 'match' : 'matches'}
                        </Badge>
                    )}
                    {!isAdmin && guideDismissed && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => {
                                setGuideDismissed(false);
                                store(GUIDE_DISMISSED_KEY, '0');
                            }}
                        >
                            <Rocket />
                            Show getting started
                        </Button>
                    )}
                </div>

                <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        ref={searchRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search workspaces — try matrix, action or chat"
                        aria-label="Search workspaces"
                        className="h-10 rounded-lg pl-11 pr-20 text-sm shadow-sm"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 text-muted-foreground md:flex">
                        <Kbd>/</Kbd>
                        <Kbd>
                            <CornerDownLeft className="size-3" />
                        </Kbd>
                    </span>
                </div>

                {filtered.length === 0 ? (
                    <Card className="border-dashed shadow-none">
                        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                            <Search
                                className="size-6 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <p className="text-base font-medium">
                                Nothing matches that search
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Try matrix, action, plan or chat.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-3"
                                onClick={() => {
                                    setQuery('');
                                    searchRef.current?.focus();
                                }}
                            >
                                Clear search
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                        {filtered.map((workspace, index) => (
                            <Link
                                key={workspace.key}
                                to={workspace.path}
                                onClick={() =>
                                    rememberWorkspace(workspace.path)
                                }
                                style={{
                                    animationDelay: `${120 + index * 50}ms`,
                                }}
                                className="group flex animate-in flex-col rounded-lg border bg-card p-4 shadow-sm outline-none transition-all duration-200 fade-in fill-mode-backwards slide-in-from-bottom-2 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <span
                                        className={cn(
                                            'flex size-9 shrink-0 items-center justify-center rounded-md',
                                            workspace.accent,
                                        )}
                                    >
                                        <workspace.icon
                                            className="size-5"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    {workspace.adminOnly && (
                                        <Badge variant="secondary">
                                            Admin
                                        </Badge>
                                    )}
                                </div>
                                <h3 className="mt-3 text-base font-semibold">
                                    <Highlight
                                        text={workspace.title}
                                        needle={needle}
                                    />
                                </h3>
                                <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
                                    <Highlight
                                        text={workspace.description}
                                        needle={needle}
                                    />
                                </p>
                                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                                    Open
                                    <ArrowRight
                                        className="size-4 transition-transform group-hover:translate-x-0.5"
                                        aria-hidden="true"
                                    />
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            {showGuide && (
                <section className="lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
                    <Card
                        style={{ animationDelay: '160ms' }}
                        className="animate-in fade-in fill-mode-backwards slide-in-from-bottom-2 duration-500"
                    >
                        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-4">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Rocket
                                        aria-hidden="true"
                                        className="size-5 text-primary"
                                    />
                                    Getting started
                                </CardTitle>
                                <CardDescription className="mt-1 text-sm">
                                    Three steps from requesting access to your
                                    first submission.
                                </CardDescription>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Hide getting started"
                                onClick={() => {
                                    setGuideDismissed(true);
                                    store(GUIDE_DISMISSED_KEY, '1');
                                }}
                            >
                                <X />
                            </Button>
                        </CardHeader>
                        <CardContent className="grid gap-4 px-4 pb-4 pt-0">
                            {accessSteps.map((step, index) => (
                                <div
                                    key={step.title}
                                    className="flex gap-3"
                                >
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold">
                                            {step.title}
                                        </h3>
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                        <CardFooter className="border-t px-4 py-2">
                            <Collapsible className="w-full">
                                <CollapsibleTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-muted-foreground"
                                    >
                                        <Sparkles />
                                        Pro tips
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-3">
                                    <ul className="grid gap-2.5">
                                        {tips.map((tip) => (
                                            <li
                                                key={tip}
                                                className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                                                />
                                                {tip}
                                            </li>
                                        ))}
                                    </ul>
                                </CollapsibleContent>
                            </Collapsible>
                        </CardFooter>
                    </Card>
                </section>
            )}
        </div>
    );
}
