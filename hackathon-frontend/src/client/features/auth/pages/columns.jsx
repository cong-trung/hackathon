import { Button } from '@/shared/components/ui/button';

export function userColumns({ onAction, busy, currentUsername }) {
    return [
        { accessorKey: 'username', header: 'Username', cell: ({ row }) => <span className="font-medium">{row.original.username}</span> },
        { accessorKey: 'display_name', header: 'Name' },
        { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email || '—' },
        { accessorKey: 'role', header: 'Role' },
        { accessorKey: 'status', header: 'Status' },
        { id: 'actions', header: 'Actions', cell: ({ row }) => {
            const user = row.original;
            if (user.username === currentUsername) return <span className="text-muted-foreground">Your account</span>;
            return <div className="flex flex-wrap gap-2">
                {user.status !== 'active' && <Button type="button" size="sm" variant="outline" disabled={busy}
                    onClick={() => onAction(user, 'approve', 'editor')}>Approve editor</Button>}
                {user.status !== 'active' && <Button type="button" size="sm" variant="outline" disabled={busy}
                    onClick={() => onAction(user, 'approve', 'admin')}>Approve admin</Button>}
                {user.status === 'pending' && <Button type="button" size="sm" variant="destructive" disabled={busy}
                    onClick={() => onAction(user, 'reject')}>Reject</Button>}
                {user.status === 'active' && <Button type="button" size="sm" variant="destructive" disabled={busy}
                    onClick={() => onAction(user, 'disable')}>Disable</Button>}
            </div>;
        } },
    ];
}