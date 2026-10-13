import { Fragment, memo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import AppSidebar from '@/shared/components/app-sidebar/app-sidebar';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import { Separator } from '@/shared/components/ui/separator';
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from '@/shared/components/ui/sidebar';

import useBreadcrumbs from '@/shared/hooks/useBreadcrumbs';
import { routesConfig } from '@/routes/constants';

function AppLayout() {
    const breadcrumbs = useBreadcrumbs();
    const { pathname } = useLocation();
    const viewportPage = [
        routesConfig.pypcs_page,
        routesConfig.view2_page,
        routesConfig.view3_page,
    ].includes(pathname);

    return (
        <SidebarProvider className="select-none" defaultOpen={true}>
            <AppSidebar />
            <SidebarInset className="min-h-0 min-w-0 md:h-dvh md:max-h-dvh">
                <header className="sticky top-0 z-20 border-b bg-background h-12 flex shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4 flex-1">
                        <SidebarTrigger className="-ml-1" />
                        <Separator
                            orientation="vertical"
                            className="mr-2 h-4"
                        />
                        <Breadcrumb>
                            <BreadcrumbList>
                                {breadcrumbs.map((crumb, index) => (
                                    <Fragment key={crumb.key}>
                                        <BreadcrumbItem>
                                            {index < breadcrumbs.length - 1 ? (
                                                <BreadcrumbPage className="text-muted-foreground">
                                                    {crumb.label}
                                                </BreadcrumbPage>
                                            ) : (
                                                <BreadcrumbPage>
                                                    {crumb.label}
                                                </BreadcrumbPage>
                                            )}
                                        </BreadcrumbItem>
                                        {index < breadcrumbs.length - 1 && (
                                            <BreadcrumbSeparator />
                                        )}
                                    </Fragment>
                                ))}
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>
                <div className={`min-h-0 w-full flex-1 bg-muted-foreground/5 p-4 overflow-auto ${viewportPage ? 'md:overflow-hidden' : ''}`}>
                    <Outlet />
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}

export default memo(AppLayout);
