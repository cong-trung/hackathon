import { Fragment, memo } from 'react';
import { Outlet } from 'react-router-dom';

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

function AppLayout() {
    const breadcrumbs = useBreadcrumbs();

    return (
        <SidebarProvider className="select-none" defaultOpen={true}>
            <AppSidebar />
            <SidebarInset className="min-h-0 max-h-screen min-w-[1600px]">
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
                <div className="flex-1 min-h-0 w-full bg-muted-foreground/5 p-4 overflow-hidden">
                    <Outlet />
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}

export default memo(AppLayout);
