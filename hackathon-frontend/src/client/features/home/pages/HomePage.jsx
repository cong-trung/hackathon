import {
    BookOpenIcon,
    CheckCircle2Icon,
    KeyRoundIcon,
    ShieldCheckIcon,
} from 'lucide-react';

import { routes } from '@/routes/routes';
import { useAuth } from '@/shared/hooks/useAuth';
import { Badge } from '@/shared/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/shared/components/ui/card';

const guideDescriptions = {
    home: 'Your starting point. Learn how to use the app and where to find each area.',
    'admin-users': 'Approve or disable accounts and assign roles. Admins only.',
    pypcs_page: 'Fill in and manage quality matrix data — products, questions, answers and submission status.',
    view2_page: 'Add and update action items, including the packages and technologies they apply to.',
    view3_page: 'Review product × action decisions, mark them final, and export the action plan.',
    chat_page: 'Ask the AI assistant questions about the project data.',
};

const accessSteps = [
    {
        title: 'Request an account',
        description: 'On the login page choose "Need access? Request an account" and fill in your details.',
    },
    {
        title: 'Wait for approval',
        description: 'An administrator reviews and approves your account. You cannot edit until then.',
    },
    {
        title: 'Log in and explore',
        description: 'Sign in with your username and password — you will land on Home, your guide to the app.',
    },
];

const tips = [
    'Use the sidebar (left) to switch between tabs; the top bar shows where you are.',
    'Editing requires an approved, active account. Requests stay "pending" until an admin approves them.',
    'Only admins can edit final submissions and manage user accounts.',
    'Changes are saved to the project data files right away.',
    'Log out from the user menu in the bottom of the sidebar when you are done.',
];

export default function HomePage() {
    const { user, isAdmin } = useAuth();
    const visibleRoutes = routes.filter(
        (route) => !route.hideInSidebar && route.key !== 'home' && (isAdmin || !route.adminOnly),
    );

    return (
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Welcome to Quality Matrix</h1>
                <p className="max-w-3xl text-sm text-muted-foreground">
                    A tool for capturing and reviewing product quality data. {user?.display_name ? `Signed in as ${user.display_name} (${user.role}).` : ''} Use the tabs in the sidebar to move around the app.
                </p>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
                {accessSteps.map((step, index) => (
                    <Card key={step.title}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                    {index + 1}
                                </span>
                                {step.title}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{step.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </section>

            <section>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <BookOpenIcon aria-hidden="true" className="size-5 text-primary" />
                                Tabs at a glance
                            </CardTitle>
                            <CardDescription className="mt-1">
                                What you will find in each tab.
                            </CardDescription>
                        </div>
                        {user && !isAdmin && (
                            <Badge variant="outline">Request edits from an admin if something is missing</Badge>
                        )}
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                        {visibleRoutes.map((route) => (
                            <div key={route.key} className="rounded-md border bg-card p-3">
                                <div className="flex items-center gap-2">
                                    <route.icon />
                                    <span className="font-semibold">{route.title}</span>
                                    {route.adminOnly && (
                                        <Badge variant="secondary">Admin only</Badge>
                                    )}
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {guideDescriptions[route.key] ?? route.title}
                                </p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </section>

            <section>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ShieldCheckIcon aria-hidden="true" className="size-5 text-primary" />
                            Quick tips
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="grid gap-2 md:grid-cols-2">
                            {tips.map((tip) => (
                                <li key={tip} className="flex items-start gap-2 text-sm text-muted-foreground">
                                    <KeyRoundIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                                    <span>{tip}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                            All set? Open the <span className="font-medium text-foreground">Quality Matrix</span> tab to start working.
                        </p>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}