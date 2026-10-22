import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { loginPath, useAuth } from '@/shared/hooks/useAuth';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowDownUp, ArrowUp, CircleAlert, CircleCheck, DownloadIcon, PencilIcon, PencilLine, SearchIcon } from 'lucide-react';

import { useGetProductActionMatrixQuery } from '@/app/api/productActionMatrixApi';
import ClientPagination from '@/shared/components/data-table/ClientPagination';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { scrollbarClassName } from '@/shared/utils/scrollbar';
import RowEditor from '../components/RowEditor';

const EMPTY = [];
const attributes = [
    ['product_name', 'Product', 192],
    ['prodgroup3', 'ProdGroup3', 144],
    ['module_group', 'Module', 128],
    ['package', 'Package', 144],
    ['bare_die_lid', 'Bare die / Lid', 144],
    ['segment', 'Segment', 144],
    ['fab_technology', 'Fab Technology', 160],
];
const stickyColumns = new Set(['product_name', 'prodgroup3', 'module_group']);

function stickyClass(column, header = false) {
    if (!stickyColumns.has(column.id)) return '';
    const edge = column.id === 'module_group'
        ? 'border-r-2 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]' : '';
    return `sticky ${header ? 'z-30 bg-table-header' : 'z-10 bg-table-frozen group-hover:bg-table-hover'} ${edge}`;
}

function columnStyle(column) {
    const width = column.getSize();
    return {
        width,
        minWidth: width,
        maxWidth: width,
        ...(stickyColumns.has(column.id) ? { left: column.getStart() } : {}),
    };
}

function displayValue(value) {
    return value?.replaceAll('|', ', ') || '—';
}

function reviewStatus(row, actions) {
    if (actions.some((action) => !row.cells?.[action.nbr]?.status)) return 'needs_review';
    if (actions.some((action) => row.cells?.[action.nbr]?.decision_state === 'draft')) return 'draft';
    return 'reviewed';
}

function rowNeedsReview(row, actions) {
    return reviewStatus(row, actions) !== 'reviewed';
}

const reviewBadges = {
    needs_review: { label: 'Needs review', Icon: CircleAlert, color: 'border-status-warning-foreground bg-status-warning text-status-warning-foreground' },
    draft: { label: 'In draft', Icon: PencilLine, color: 'border-status-info-foreground bg-status-info text-status-info-foreground' },
    reviewed: { label: 'Reviewed', Icon: CircleCheck, color: 'border-status-success-foreground bg-status-success text-status-success-foreground' },
};

function ReviewStatusCell({ row }) {
    const { label, Icon, color } = reviewBadges[row.original.reviewStatus];
    return (
        <Badge variant="outline" className={`gap-1 whitespace-nowrap px-1.5 py-0.5 text-[11px] ${color}`}>
            <Icon aria-hidden="true" className="size-3 shrink-0" />
            {label}
        </Badge>
    );
}

function ProductCell({ row, table }) {
    return (
        <div className="min-w-0">
            <div className="flex items-start gap-1">
                <span className="min-w-0 break-words font-semibold">{row.original.product_name || 'Unnamed product'}</span>
                {row.original.submission_status === 'draft' && <Badge variant="outline" className="shrink-0 text-[10px]">Draft</Badge>}
            </div>
            {table.options.meta.canEdit && <Button variant="outline" size="sm" type="button" className="mt-1 h-7 gap-1 px-2 text-xs"
                onClick={() => table.options.meta.onEdit(row.original, null)}
                aria-label={`Edit ${row.original.product_name} ${row.original.module_group}`}>
                <PencilIcon className="size-3" /> Edit
            </Button>}
        </div>
    );
}

function ModuleCell({ row }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span tabIndex={0} className="block w-full cursor-help break-words text-table-link underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                    {row.original.module_group}
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-line break-words">
                Module keys: {row.original.module_keys?.join(', ') || '—'}{'\n'}
                Operations: {row.original.operations?.join(', ') || '—'}
            </TooltipContent>
        </Tooltip>
    );
}

function AttributeCell({ getValue }) {
    return <span className="break-words">{displayValue(getValue())}</span>;
}

function StatusCell({ row, column, table }) {
    const action = column.columnDef.meta.action;
    const cell = row.original.cells?.[action.nbr];
    const status = cell?.status;
    const draft = cell?.decision_state === 'draft';
        const label = draft ? `${status || 'N (default)'} draft` : status || 'N (default), not reviewed';
        const style = draft ? `${status === 'Y' ? 'bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100'
                : status === 'N' ? 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100'
                    : status === 'NA' ? 'bg-muted text-foreground'
                        : 'bg-muted text-muted-foreground'} border border-dashed border-border`
                : status === 'Y' ? 'bg-green-600 text-white hover:bg-green-700'
                : status === 'N' ? 'bg-red-600 text-white hover:bg-red-700'
                    : status === 'NA' ? 'bg-muted text-foreground hover:bg-accent'
                        : 'text-muted-foreground hover:bg-muted';
        const description = draft
                ? `Draft · ${cell.comment || '—'} · ${cell.updated_by || '—'} · ${cell.updated_at || '—'}`
                : status
        ? `${cell.comment || ''}${cell.updated_by ? `\nUpdated by: ${cell.updated_by}` : ''}${cell.updated_at ? `\nUpdated at: ${cell.updated_at}` : ''}`
        : '';

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" disabled={!table.options.meta.canEdit} className={`h-10 w-full truncate rounded-sm px-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${style}`}
                    aria-label={`${row.original.product_name} ${action.event_id || `#${action.nbr}`}: ${label}`}
                    onClick={() => table.options.meta.onEdit(row.original, action.nbr)}>
                    {draft ? <span className="flex items-center gap-1 truncate">
                        <span className="truncate">{status || 'N (default)'}</span><span className="shrink-0 text-[9px]">draft</span>
                    </span> : status ? `${status}${cell.comment ? ` (${cell.comment})` : ''}` : 'N (default)'}
                </button>
            </TooltipTrigger>
            {description && <TooltipContent className="max-w-xs whitespace-pre-line break-words">{description}</TooltipContent>}
        </Tooltip>
    );
}

function columnsFor(actions) {
    return [
        ...attributes.map(([key, title, size]) => ({
            accessorKey: key,
            header: title,
            size,
            cell: key === 'product_name' ? ProductCell : key === 'module_group' ? ModuleCell : AttributeCell,
        })),
        { id: 'review_status', header: 'Review status', size: 120, cell: ReviewStatusCell },
        ...actions.map((action) => ({
            id: `action-${action.nbr}`,
            header: action.actionable_item,
            size: 136,
            meta: { action },
            cell: StatusCell,
        })),
    ];
}

export default function View3Page() {
    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const [moduleGroup, setModuleGroup] = useState('');
    const [search, setSearch] = useState('');
    const [needsReview, setNeedsReview] = useState(false);
    const [sort, setSort] = useState({ key: 'product_name', direction: 'ascending' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [editor, setEditor] = useState(null);
    const [activeDescription, setActiveDescription] = useState(null);
    const allQuery = useGetProductActionMatrixQuery({});
    const filteredQuery = useGetProductActionMatrixQuery({ moduleGroup }, { skip: !moduleGroup });
    const query = moduleGroup ? filteredQuery : allQuery;
    const data = query.data ?? allQuery.data;
    const actions = data?.actions ?? EMPTY;
    const rows = data?.rows ?? EMPTY;
    const groups = allQuery.data?.module_groups ?? data?.module_groups ?? EMPTY;
    const term = useDeferredValue(search).trim().toLowerCase();
    const visibleRows = useMemo(() => rows.filter((row) => {
        const matches = !term || [row.product_name, row.prodgroup3, row.module_group, ...(row.module_keys ?? [])]
            .some((value) => value?.toLowerCase().includes(term));
        return matches && (!needsReview || rowNeedsReview(row, actions));
    }), [rows, actions, term, needsReview]);
    const sortedRows = useMemo(() => visibleRows.map((row) => ({ ...row, reviewStatus: reviewStatus(row, actions) }))
        .sort((first, second) => {
            const comparison = sort.key === 'review_status'
                ? ['needs_review', 'draft', 'reviewed'].indexOf(first.reviewStatus)
                    - ['needs_review', 'draft', 'reviewed'].indexOf(second.reviewStatus)
                : String(first[sort.key] ?? '').localeCompare(String(second[sort.key] ?? ''), undefined, { numeric: true });
            return sort.direction === 'ascending' ? comparison : -comparison;
        }), [visibleRows, actions, sort]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(sortedRows.length / pageSize)));
        const pagedRows = useMemo(
            () => sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
            [sortedRows, currentPage, pageSize],
        );
    const columns = useMemo(() => columnsFor(actions), [actions]);
    const onEdit = useCallback((row, actionNbr) => {
        if (isAuthenticated) setEditor({ row, actionNbr });
    }, [isAuthenticated]);
    const tableMeta = useMemo(() => ({ onEdit, canEdit: isAuthenticated }), [onEdit, isAuthenticated]);
    const table = useReactTable({
        data: pagedRows,
        columns,
        meta: tableMeta,
        getRowId: (row) => `${row.product_key}::${row.module_group}`,
        getCoreRowModel: getCoreRowModel(),
    });
    const rowModel = table.getRowModel();
    const leafColumns = table.getAllLeafColumns();
    const productColumns = leafColumns.filter((column) => !column.columnDef.meta?.action);
    const exportUrl = `/api/pypcs/product-action-matrix/export${moduleGroup ? `?module_group=${encodeURIComponent(moduleGroup)}` : ''}`;

    function renderHeader(column) {
        if (!['product_name', 'review_status'].includes(column.id)) return column.columnDef.header;
        const direction = sort.key === column.id ? sort.direction : 'none';
        const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowDownUp;
        return (
            <button type="button" className="inline-flex items-center gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={() => { setSort({ key: column.id, direction: direction === 'ascending' ? 'descending' : 'ascending' }); setPage(1); }}>
                {column.columnDef.header}<Icon aria-hidden="true" className="size-4 shrink-0" />
            </button>
        );
    }

    return (
        <TooltipProvider>
            <div className="flex min-w-0 flex-col gap-3 md:h-full md:min-h-0 md:overflow-hidden">
                <h1 className="sr-only">Action Plan</h1>
                {!isAuthenticated && <Link className="text-sm underline" to={loginPath(location.pathname + location.search)}>Log in to edit</Link>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Decision legend">
                    <span><span className="mr-1 inline-block size-3 bg-green-600 align-middle" />Y</span>
                    <span><span className="mr-1 inline-block size-3 bg-red-600 align-middle" />N</span>
                    <span><span className="mr-1 inline-block size-3 border bg-muted align-middle" />NA</span>
                    <span><span className="mr-1 inline-block size-3 border border-dashed border-border bg-green-200 align-middle dark:bg-green-900" />Draft</span>
                    <span>N (default) = not reviewed yet</span>
                </div>
                <Tabs value={moduleGroup || '__all__'} onValueChange={(value) => { setModuleGroup(value === '__all__' ? '' : value); setPage(1); }} className="min-w-0">
                    <div className={`overflow-x-auto ${scrollbarClassName}`}>
                        <TabsList className="h-auto w-max justify-start gap-1">
                            <TabsTrigger value="__all__">All ({allQuery.data?.rows?.length ?? rows.length})</TabsTrigger>
                            {groups.map((group) => (
                                <TabsTrigger key={group.key} value={group.key}>{group.label} ({group.product_count})</TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                </Tabs>
                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative w-full max-w-sm">
                        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input type="search" aria-label="Search products, ProdGroup3 or module"
                            placeholder="Search products or modules" value={search}
                            onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="pl-9" />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox checked={needsReview} onCheckedChange={(value) => { setNeedsReview(value === true); setPage(1); }} />
                        Needs review only
                    </label>
                    <span role="status" aria-live="polite" className="text-sm text-muted-foreground">{visibleRows.length} products found · {actions.length} actions</span>
                    <Button asChild variant="outline" size="sm" className="ml-auto shrink-0">
                        <a href={exportUrl} download><DownloadIcon className="mr-2 size-4" /> Export CSV</a>
                    </Button>
                </div>
                {query.isError ? (
                    <div role="alert" className="rounded-md border border-destructive/30 p-5 text-sm text-destructive">
                        Could not load the product action matrix.{' '}
                        <Button type="button" variant="outline" onClick={query.refetch}>Retry</Button>
                    </div>
                ) : !data && query.isLoading ? (
                    <div aria-label="Loading product action matrix" className="space-y-3 rounded-md border p-4">
                        <Skeleton className="h-20 w-full" />
                        {[1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-14 w-full" />)}
                    </div>
                ) : (
                    <div aria-busy={query.isFetching} className={`min-h-[320px] min-w-0 max-w-full overflow-auto rounded-md border border-table-border md:min-h-0 md:flex-1 ${scrollbarClassName}`}>
                        {query.isFetching && <p className="sr-only" role="status">Updating matrix</p>}
                        <Table style={{ width: table.getTotalSize() }} className="table-fixed border-separate border-spacing-0 text-xs">
                            <colgroup>
                                {leafColumns.map((column) => <col key={column.id} style={{ width: column.getSize() }} />)}
                            </colgroup>
                            <TableHeader className="sticky top-0 z-20 bg-table-header">
                                <TableRow className="bg-table-header hover:bg-table-header">
                                    {productColumns.map((column, index) => (
                                        <TableHead key={column.id} style={columnStyle(column)}
                                            className={`border-b border-r border-white/20 bg-table-header text-table-header-foreground ${stickyClass(column, true)} ${index === productColumns.length - 1 ? 'text-right' : ''}`}>
                                            {index === productColumns.length - 1 ? 'Excursion/FMEA IDN' : null}
                                        </TableHead>
                                    ))}
                                    {actions.map((action, index) => (
                                        <TableHead key={action.nbr} style={columnStyle(leafColumns[productColumns.length + index])}
                                            className="border-b border-r border-white/20 bg-table-header text-center font-semibold text-table-header-foreground [overflow-wrap:anywhere]">
                                            {action.event_id || `#${action.nbr}`}
                                        </TableHead>
                                    ))}
                                </TableRow>
                                <TableRow className="bg-table-header hover:bg-table-header">
                                    {leafColumns.map((column) => (
                                        <TableHead key={column.id} aria-sort={['product_name', 'review_status'].includes(column.id) ? (sort.key === column.id ? sort.direction : 'none') : undefined} style={columnStyle(column)}
                                            className={`border-b border-r border-white/20 bg-table-header align-top font-semibold text-table-header-foreground ${stickyClass(column, true)}`}>
                                            {column.columnDef.meta?.action ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span tabIndex={0} className="line-clamp-4 cursor-help break-words underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                                                            {column.columnDef.header}
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-sm whitespace-pre-line break-words">
                                                        {column.columnDef.header}{'\n'}Reference: {column.columnDef.meta.action.reference || '—'}
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : renderHeader(column)}
                                        </TableHead>
                                    ))}
                                </TableRow>
                                <TableRow className="bg-table-subheader hover:bg-table-subheader">
                                    {productColumns.map((column) => (
                                        <TableHead key={column.id} style={columnStyle(column)}
                                            className={`h-16 border-b border-r border-table-border bg-table-subheader text-table-subheader-foreground ${stickyColumns.has(column.id) ? 'sticky z-30' : ''} ${column.id === 'module_group' ? 'border-r-2' : ''}`} />
                                    ))}
                                    {actions.map((action, index) => {
                                        const reference = String(action.reference || '').trim();
                                        const isWebLink = /^https?:\/\//i.test(reference);
                                        return (
                                            <TableHead key={action.nbr} style={columnStyle(leafColumns[productColumns.length + index])}
                                                className="h-16 border-b border-r border-table-border bg-table-subheader align-top text-table-subheader-foreground">
                                                <Popover open={activeDescription === action.nbr}
                                                    onOpenChange={(open) => setActiveDescription(open ? action.nbr : null)}>
                                                    <PopoverTrigger asChild>
                                                        <button type="button" className="line-clamp-3 w-full rounded-sm text-left text-xs font-normal [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                                                            onFocus={(event) => {
                                                                if (event.currentTarget.matches(':focus-visible')) setActiveDescription(action.nbr);
                                                            }}
                                                            aria-label={`Details for ${action.event_id || `#${action.nbr}`}`}>
                                                            {action.description?.trim() || action.actionable_item || '—'}
                                                        </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="max-h-[min(70vh,28rem)] w-80 max-w-[calc(100vw-2rem)] overflow-auto text-sm" align="start">
                                                        <p className="font-medium">Actionable item</p>
                                                        <p className="whitespace-pre-wrap break-words">{action.actionable_item || '—'}</p>
                                                        <p className="mt-2 font-medium">Reference</p>
                                                        <p className="break-words">{isWebLink ? <a className="text-table-link underline" href={reference} target="_blank" rel="noopener noreferrer">{reference}</a> : reference || '—'}</p>
                                                        <p className="mt-2 font-medium">Description</p>
                                                        <p className="whitespace-pre-wrap break-words">{action.description || '—'}</p>
                                                    </PopoverContent>
                                                </Popover>
                                            </TableHead>
                                        );
                                    })}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rowModel.rows.length ? rowModel.rows.map((row) => (
                                    <TableRow key={row.id} className="group even:bg-table-stripe hover:bg-table-hover">
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} style={columnStyle(cell.column)}
                                                className={`border-b border-r border-table-border align-top [overflow-wrap:anywhere] ${stickyClass(cell.column)}`}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={leafColumns.length} className="h-32 text-center text-muted-foreground">
                                        {rows.length ? <>No matching products.{' '}
                                            <Button type="button" variant="outline" size="sm" onClick={() => { setSearch(''); setNeedsReview(false); setModuleGroup(''); setPage(1); }}>Clear filters</Button>
                                        </> : 'No Quality Matrix submissions yet'}
                                    </TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
                {!query.isLoading && !query.isError && <ClientPagination label="Products" total={sortedRows.length}
                    page={currentPage} pageSize={pageSize} onPageChange={setPage}
                    onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
                {isAuthenticated && editor && <RowEditor key={`${editor.row.product_key}::${editor.row.module_group}`}
                    row={editor.row} actions={actions} focusedAction={editor.actionNbr}
                    onReload={async () => {
                        const latest = await query.refetch().unwrap();
                        const row = latest.rows.find((entry) =>
                            entry.product_key === editor.row.product_key
                            && entry.module_group === editor.row.module_group);
                        if (!row) throw new Error('Row no longer exists.');
                        return row;
                    }} onClose={() => setEditor(null)} />}
            </div>
        </TooltipProvider>
    );
}