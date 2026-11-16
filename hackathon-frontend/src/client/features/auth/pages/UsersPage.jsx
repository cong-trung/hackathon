import { useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useApproveUserMutation, useChangeUserRoleMutation, useDisableUserMutation, useGetUsersMetaQuery, useGetUsersPageQuery, useRejectUserMutation } from '@/app/api/authApi';
import DataTable from '@/shared/components/data-table/data-table';
import ServerPagination from '@/shared/components/data-table/ServerPagination';
import LazyTabs from '@/shared/components/lazy-tabs/LazyTabs';
import useServerTable from '@/shared/hooks/useServerTable';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { authErrorMessage, loginPath, roleLabels, useAuth } from '@/shared/hooks/useAuth';
import { userColumns } from './columns';
import ActivityTab from './ActivityTab';

export default function UsersPage() {
    const { user, isLoading, isAdmin } = useAuth();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') === 'activity' ? 'activity' : 'users';
    const metaQuery = useGetUsersMetaQuery(undefined, { skip: !isAdmin || activeTab !== 'users' });
    const tabs = (metaQuery.data?.tabs ?? []).map((tab) => ({ ...tab, label: tab.key[0].toUpperCase() + tab.key.slice(1) }));
    const requestedStatus = searchParams.get('status');
    const status = tabs.some((tab) => tab.key === requestedStatus) ? requestedStatus : 'pending';
    const tableState = useServerTable({ tabKey: status });
    const [pending, setPending] = useState(null);
    const [error, setError] = useState('');
    const { currentData: data, isLoading: loadingUsers, isFetching, isError, error: listError, refetch } = useGetUsersPageQuery(
        { status, q: tableState.args.q, limit: tableState.limit, offset: tableState.offset },
        { skip: !isAdmin || activeTab !== 'users' || !metaQuery.data },
    );
    const loadingPage = loadingUsers || (isFetching && !data);
    const [approve, approveState] = useApproveUserMutation();
    const [changeRole, roleState] = useChangeUserRoleMutation();
    const [reject, rejectState] = useRejectUserMutation();
    const [disable, disableState] = useDisableUserMutation();
    const busy = approveState.isLoading || rejectState.isLoading || disableState.isLoading || roleState.isLoading;

    if (isLoading) return <p role="status">Checking session...</p>;
    if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
    if (!isAdmin) return <main role="alert"><h1 className="text-xl font-semibold">403 · Access denied</h1>
        <p>Only admins can manage users.</p><Link to="/product-info" className="underline">Back to Product Info</Link></main>;

    async function confirmAction() {
        if (!pending) return;
        setError('');
        try {
            if (pending.action === 'approve') await approve({ username: pending.user.username, role: pending.role }).unwrap();
            if (pending.action === 'role') await changeRole({ username: pending.user.username, role: pending.role }).unwrap();
            if (pending.action === 'reject') await reject(pending.user.username).unwrap();
            if (pending.action === 'disable') await disable(pending.user.username).unwrap();
            setPending(null);
        } catch (failure) {
            setError(authErrorMessage(failure));
        }
    }

    return <main className="mx-auto w-full max-w-6xl space-y-5">
        <header><h1 className="text-2xl font-semibold">Users</h1>
            <p className="text-sm text-muted-foreground">Review requests and manage access.</p></header>
        <LazyTabs tabs={[{ key: 'users', label: 'Users' }, { key: 'activity', label: 'Activity' }]}
            activeKey={activeTab} onChange={() => setError('')} renderPanel={(panel) => panel === 'activity'
                ? <ActivityTab active />
                : <>
                    {metaQuery.isError && <div role="alert"><p>{authErrorMessage(metaQuery.error)}</p><Button variant="outline" onClick={metaQuery.refetch}>Retry</Button></div>}
                    <LazyTabs tabs={tabs} activeKey={status} urlParam="status" loading={!metaQuery.data}
                        onChange={() => { tableState.resetOffset(); setError(''); }} renderPanel={() => (<>
                            <label className="flex max-w-sm flex-col gap-1 text-sm font-medium" htmlFor="users-search">Search users
                                <Input id="users-search" type="search" value={tableState.search}
                                    onChange={(event) => tableState.setSearch(event.target.value)} placeholder="Name, username, or email" />
                            </label>
                            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                            {loadingPage ? <p role="status">Loading users...</p> : isError ?
                                <div role="alert"><p>{authErrorMessage(listError)}</p><Button variant="outline" onClick={refetch}>Retry</Button></div> :
                                <DataTable columns={userColumns({ onAction: (selected, action, role) => setPending({ user: selected, action, role }),
                                    busy, currentUsername: user.username })} data={data?.items || []} manualPagination TablePagination={null} />}
                            {!loadingPage && !isError && <ServerPagination label="Users" total={data?.total ?? 0}
                                limit={tableState.limit} offset={tableState.offset} onOffsetChange={tableState.setOffset} onLimitChange={tableState.changeLimit} />}
                        </>)} />
                </>} />
        <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
            <AlertDialogContent><AlertDialogHeader>
                <AlertDialogTitle>{pending?.action === 'role' ? 'Change role for' : pending?.action === 'approve' ? 'Approve' : pending?.action === 'reject' ? 'Reject' : 'Disable'} {pending?.user.display_name}?</AlertDialogTitle>
                <AlertDialogDescription>{pending?.action === 'role' || pending?.action === 'approve'
                    ? `Grant ${roleLabels[pending?.role] || pending?.role} access to ${pending?.user.username}?`
                    : `This will ${pending?.action} ${pending?.user.username}'s access. The account can be approved again later.`}</AlertDialogDescription>
            </AlertDialogHeader><AlertDialogFooter>
                {error && <p role="alert" className="mr-auto text-sm text-destructive">{error}</p>}
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); confirmAction(); }}>
                    {busy ? 'Working...' : 'Confirm'}
                </AlertDialogAction>
            </AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
    </main>;
}