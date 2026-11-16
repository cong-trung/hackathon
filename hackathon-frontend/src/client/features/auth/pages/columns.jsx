import { Button } from '@/shared/components/ui/button';
import { roleLabels } from '@/shared/hooks/useAuth';

export function userColumns({ onAction, busy, currentUsername }) {
    return [
        { accessorKey: 'username', header: 'Username', cell: ({ row }) => <span className="font-medium">{row.original.username}</span> },
        { accessorKey: 'display_name', header: 'Name' },
        { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email || '—' },
        { accessorKey: 'role', header: 'Role', cell: ({ row }) => row.original.status === 'active'
            ? <select aria-label={`Role for ${row.original.username}`} className="rounded border bg-background px-2 py-1"
                value={row.original.role} disabled={busy || row.original.username === currentUsername}
                onChange={(event) => onAction(row.original, 'role', event.target.value)}>
                {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select> : roleLabels[row.original.role] || row.original.role },
        { accessorKey: 'status', header: 'Status' },
        { id: 'actions', header: 'Actions', cell: ({ row }) => {
            const user = row.original;
            if (user.username === currentUsername) return <span className="text-muted-foreground">Your account</span>;
            return <div className="flex flex-wrap gap-2">
                {user.status !== 'active' && <select aria-label={`Approve ${user.username} as`} className="rounded border bg-background px-2 py-1 text-sm"
                    value="" disabled={busy} onChange={(event) => onAction(user, 'approve', event.target.value)}>
                    <option value="" disabled>Approve as...</option>
                    {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>}
                {user.status === 'pending' && <Button type="button" size="sm" variant="destructive" disabled={busy}
                    onClick={() => onAction(user, 'reject')}>Reject</Button>}
                {user.status === 'active' && <Button type="button" size="sm" variant="destructive" disabled={busy}
                    onClick={() => onAction(user, 'disable')}>Disable</Button>}
            </div>;
        } },
    ];
}