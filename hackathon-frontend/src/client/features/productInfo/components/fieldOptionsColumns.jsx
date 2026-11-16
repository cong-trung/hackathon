import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';

function formatSeen(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function fieldOptionsColumns({ submissionsById, onAction, isAdmin }) {
    return [
        { accessorKey: 'question_label', header: 'Field', cell: ({ row }) => row.original.question_label || row.original.question_id },
        { accessorKey: 'module_key', header: 'Module', cell: ({ row }) => row.original.module_key || '—' },
        { accessorKey: 'value', header: 'Value', cell: ({ row }) => <span className="break-words font-medium">{row.original.value}</span> },
        {
            id: 'used', header: 'Used in',
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="min-w-32">
                        <span>{item.submission_count} submissions</span>
                        <span className="block text-xs text-muted-foreground">{item.final_submission_count} final</span>
                        {item.submission_ids?.length > 0 && (
                            <details className="mt-1">
                                <summary className="cursor-pointer text-sm text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">View submissions</summary>
                                <ul className="max-h-40 space-y-1 overflow-y-auto py-1">
                                    {item.submission_ids.map((id) => (
                                        <li key={id}>
                                            <Link className="text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" to={`/product-info?submission=${encodeURIComponent(id)}`}>
                                                {submissionsById[id]?.product_name || id}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                );
            },
        },
        { id: 'seen', header: 'First / Last seen', cell: ({ row }) => (
            <span className="text-muted-foreground">{formatSeen(row.original.first_seen)} / {formatSeen(row.original.last_seen)}</span>
        ) },
        { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.original.status}</Badge> },
        {
            id: 'actions', header: 'Actions',
            cell: ({ row }) => row.original.status === 'pending' ? (
                <div className="flex min-w-36 flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => onAction(row.original, 'approve')}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={!isAdmin && row.original.final_submission_count > 0}
                        title={!isAdmin && row.original.final_submission_count > 0 ? 'Only admins can map values used in final submissions.' : undefined}
                        onClick={() => onAction(row.original, 'map')}>Map to existing</Button>
                    <Button size="sm" variant="outline" onClick={() => onAction(row.original, 'reject')}>Reject</Button>
                    {!isAdmin && row.original.final_submission_count > 0 && (
                        <span className="text-xs text-muted-foreground">Only admins can map final submissions.</span>
                    )}
                </div>
            ) : '—',
        },
    ];
}