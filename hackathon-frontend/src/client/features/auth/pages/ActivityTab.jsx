import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useGetAdminChangesQuery } from '@/app/api/adminApi';
import DataTable from '@/shared/components/data-table/data-table';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Form } from '@/shared/components/ui/form';
import { roleLabels } from '@/shared/hooks/useAuth';

const types = { product_info: 'Product Info', action_item: 'Action item', matrix_decision: 'Matrix', option: 'Field option', user: 'User' };
const filtersSchema = z.object({
    entity_type: z.string(), entity_id: z.string().max(200), username: z.string().max(128),
    q: z.string().max(200), from: z.string(), to: z.string(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'From must be on or before To.', path: ['to'],
});
const emptyFilters = { entity_type: '', entity_id: '', username: '', q: '', from: '', to: '' };
const limit = 25;

function valueCell(value) {
    if (!value) return <span className="text-muted-foreground">—</span>;
    return value.length > 80 ? <details className="max-w-56 break-words"><summary className="cursor-pointer">{value.slice(0, 80)}…</summary>
        <span className="whitespace-pre-wrap">{value}</span></details> : <span className="break-words">{value}</span>;
}

const columns = [
    { accessorKey: 'changed_at', header: 'Time', cell: ({ row }) => <time dateTime={row.original.changed_at}>{new Date(row.original.changed_at).toLocaleString()}</time> },
    { accessorKey: 'username', header: 'User' },
    { accessorKey: 'role', header: 'Role', cell: ({ getValue }) => roleLabels[getValue()] || getValue() },
    { accessorKey: 'entity_type', header: 'Type', cell: ({ getValue }) => types[getValue()] || getValue() },
    { id: 'ticket', header: 'Ticket', cell: ({ row }) => <span className="break-words">{row.original.ticket_label || '—'} <span className="text-muted-foreground">({row.original.entity_id})</span></span> },
    { accessorKey: 'action', header: 'Action' },
    { accessorKey: 'field', header: 'Field' },
    { accessorKey: 'module_key', header: 'Module', cell: ({ getValue }) => getValue() || '—' },
    { id: 'change', header: 'Old → New', cell: ({ row }) => <div className="flex min-w-48 items-start gap-1">{valueCell(row.original.old_value)}<span aria-hidden="true">→</span>{valueCell(row.original.new_value)}</div> },
];

export default function ActivityTab({ active }) {
    const form = useForm({ resolver: zodResolver(filtersSchema), defaultValues: emptyFilters });
    const [filters, setFilters] = useState(emptyFilters);
    const [page, setPage] = useState(0);
    const { data, isFetching, isError, refetch } = useGetAdminChangesQuery({
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), limit, offset: page * limit,
    }, { skip: !active });
    const exportParams = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));

    return <section aria-label="Admin activity" className="space-y-4">
        <Form {...form}><form onSubmit={form.handleSubmit((values) => { setFilters(values); setPage(0); })} className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">Type<select className="block h-9 rounded border bg-background px-2" {...form.register('entity_type')}>
                <option value="">All types</option>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            {[['entity_id', 'Ticket / entity ID'], ['username', 'User'], ['q', 'Search']].map(([key, label]) =>
                <label key={key} className="space-y-1 text-sm">{label}<Input className="w-40" {...form.register(key)} /></label>)}
            {[['from', 'From'], ['to', 'To']].map(([key, label]) =>
                <label key={key} className="space-y-1 text-sm">{label}<Input type="date" {...form.register(key)} /></label>)}
            <Button type="submit" size="sm">Apply filters</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { form.reset(emptyFilters); setFilters(emptyFilters); setPage(0); }}>Clear</Button>
            <Button asChild size="sm" variant="outline"><a href={`/api/admin/changes/export.csv${exportParams.size ? `?${exportParams}` : ''}`}>Export CSV</a></Button>
        </form></Form>
        {Object.values(form.formState.errors).map((error, index) => <p role="alert" key={index} className="text-sm text-destructive">{error.message}</p>)}
        {isError ? <div role="alert" className="text-sm text-destructive">Could not load activity. <Button type="button" variant="outline" onClick={refetch}>Retry</Button></div>
            : <>
                <p role="status" className="text-sm text-muted-foreground">{isFetching ? 'Loading activity...' : `${data?.total ?? 0} changes`}</p>
                <DataTable columns={columns} data={data?.items || []} paginationPageSize={1000} TablePagination={() => null} />
                <nav aria-label="Activity pages" className="flex items-center justify-end gap-3 text-sm">
                    <Button type="button" size="sm" variant="outline" disabled={page === 0 || isFetching} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                    <span>Page {page + 1} of {Math.max(1, Math.ceil((data?.total || 0) / limit))}</span>
                    <Button type="button" size="sm" variant="outline" disabled={(page + 1) * limit >= (data?.total || 0) || isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
                </nav>
            </>}
    </section>;
}