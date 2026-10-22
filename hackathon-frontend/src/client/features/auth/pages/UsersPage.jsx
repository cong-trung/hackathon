import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useApproveUserMutation, useDisableUserMutation, useListUsersQuery, useRejectUserMutation } from '@/app/api/authApi';
import DataTable from '@/shared/components/data-table/data-table';
import { Button } from '@/shared/components/ui/button';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { authErrorMessage, loginPath, useAuth } from '@/shared/hooks/useAuth';
import { userColumns } from './columns';

const statuses = ['pending', 'active', 'rejected', 'disabled'];

export default function UsersPage() {
    const { user, isLoading, isAdmin } = useAuth();
    const location = useLocation();
    const [status, setStatus] = useState('pending');
    const [pending, setPending] = useState(null);
    const [error, setError] = useState('');
    const { data, isLoading: loadingUsers, isError, error: listError, refetch } = useListUsersQuery(status, { skip: !isAdmin });
    const [approve, approveState] = useApproveUserMutation();
    const [reject, rejectState] = useRejectUserMutation();
    const [disable, disableState] = useDisableUserMutation();
    const busy = approveState.isLoading || rejectState.isLoading || disableState.isLoading;

    if (isLoading) return <p role="status">Checking session...</p>;
    if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
    if (!isAdmin) return <main role="alert"><h1 className="text-xl font-semibold">403 · Access denied</h1>
        <p>Only admins can manage users.</p><Link to="/pypcs" className="underline">Back to Quality Matrix</Link></main>;

    async function confirmAction() {
        if (!pending) return;
        setError('');
        try {
            if (pending.action === 'approve') await approve({ username: pending.user.username, role: pending.role }).unwrap();
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
        <div role="group" aria-label="Account status" className="flex flex-wrap gap-2">
            {statuses.map((value) => <Button key={value} size="sm" type="button"
                variant={status === value ? 'default' : 'outline'} aria-pressed={status === value}
                onClick={() => { setStatus(value); setError(''); }} className="capitalize">{value}</Button>)}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loadingUsers ? <p role="status">Loading users...</p> : isError ?
            <div role="alert"><p>{authErrorMessage(listError)}</p><Button variant="outline" onClick={refetch}>Retry</Button></div> :
            <DataTable columns={userColumns({ onAction: (selected, action, role) => setPending({ user: selected, action, role }),
                busy, currentUsername: user.username })} data={data?.users || []} paginationPageSize={10} paginationArray={[10, 25, 50]} />}
        <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
            <AlertDialogContent><AlertDialogHeader>
                <AlertDialogTitle>{pending?.action === 'approve' ? 'Approve' : pending?.action === 'reject' ? 'Reject' : 'Disable'} {pending?.user.display_name}?</AlertDialogTitle>
                <AlertDialogDescription>{pending?.action === 'approve'
                    ? `Grant ${pending?.role} access to ${pending?.user.username}?`
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