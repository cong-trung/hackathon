import { useDeferredValue, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { DownloadIcon, Grid3x3Icon, PencilIcon, SearchIcon } from 'lucide-react';

import { useGetProductActionMatrixQuery } from '@/app/api/productActionMatrixApi';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
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
    const position = column.id === 'module_group' ? 'md:sticky' : 'sticky';
    return `${position} ${header ? 'z-30' : 'z-10'}`;
}

function displayValue(value) {
    return value?.replaceAll('|', ', ') || '—';
}

function ProductCell({ row, table }) {
    return (
        <div className="min-w-0">
            <div className="flex items-start gap-1">
                <span className="min-w-0 break-words font-semibold">{row.original.product_name || 'Unnamed product'}</span>
                {row.original.submission_status === 'draft' && <Badge variant="outline" className="shrink-0 text-[10px]">Draft</Badge>}
            </div>
            <Button variant="outline" size="sm" type="button" className="mt-1 h-7 gap-1 px-2 text-xs"
                onClick={() => table.options.meta.onEdit(row.original, null)}
                aria-label={`Edit ${row.original.product_name} ${row.original.module_group}`}>
                <PencilIcon className="size-3" /> Edit
            </Button>
        </div>
    );
}

function ModuleCell({ row }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span tabIndex={0} className="block w-full cursor-help break-words underline decoration-dotted underline-offset-4">
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
    const suggested = !status && cell?.suggested_status;
        const label = draft ? `${status || (cell.comment ? 'note' : 'not reviewed')} draft` : status || 'not reviewed';
        const style = draft ? `${status === 'Y' ? 'bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100'
                : status === 'N' ? 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100'
                    : status === 'NA' ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'} border border-dashed border-slate-500`
                : status === 'Y' ? 'bg-green-600 text-white hover:bg-green-700'
        : status === 'N' ? 'bg-red-600 text-white hover:bg-red-700'
          : status === 'NA' ? 'bg-slate-300 text-slate-900 hover:bg-slate-400 dark:bg-slate-600 dark:text-white'
            : suggested ? 'border border-dashed border-slate-400 text-muted-foreground italic hover:bg-slate-100 dark:hover:bg-slate-800'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800';
        const description = draft
                ? `Draft · ${cell.comment || '—'} · ${cell.updated_by || '—'} · ${cell.updated_at || '—'}`
                : status
        ? `${cell.comment || ''}${cell.updated_by ? `\nUpdated by: ${cell.updated_by}` : ''}${cell.updated_at ? `\nUpdated at: ${cell.updated_at}` : ''}`
        : suggested ? cell.suggested_comment : '';

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className={`h-10 w-full truncate rounded-sm px-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${style}`}
                    aria-label={`${row.original.product_name} ${action.event_id || `#${action.nbr}`}: ${label}`}
                    onClick={() => table.options.meta.onEdit(row.original, action.nbr)}>
                    {draft ? <span className="flex items-center gap-1 truncate">
                        <span className="truncate">{status || 'note'}</span><span className="shrink-0 text-[9px]">draft</span>
                    </span> : status ? `${status}${cell.comment ? ` (${cell.comment})` : ''}` : suggested ? `${suggested}?` : ''}
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
    const [moduleGroup, setModuleGroup] = useState('');
    const [search, setSearch] = useState('');
    const [needsReview, setNeedsReview] = useState(false);
    const [editor, setEditor] = useState(null);
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
        return matches && (!needsReview || actions.some((action) =>
            !row.cells?.[action.nbr]?.status || row.cells?.[action.nbr]?.decision_state === 'draft'));
    }), [rows, actions, term, needsReview]);
    const columns = useMemo(() => columnsFor(actions), [actions]);
    const table = useReactTable({
        data: visibleRows,
        columns,
        meta: { onEdit: (row, actionNbr) => setEditor({ row, actionNbr }) },
        getRowId: (row) => `${row.product_key}::${row.module_group}`,
        getCoreRowModel: getCoreRowModel(),
    });
    const rowModel = table.getRowModel();
    const leafColumns = table.getAllLeafColumns();
    const productColumnCount = leafColumns.filter((column) => !column.columnDef.meta?.action).length;
    const exportUrl = `/api/pypcs/product-action-matrix/export${moduleGroup ? `?module_group=${encodeURIComponent(moduleGroup)}` : ''}`;

    return (
        <TooltipProvider>
            <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-semibold"><Grid3x3Icon className="size-5 text-slate-600" /> View 3</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Product × Excursion/FMEA action matrix</p>
                        <p className="mt-1 text-xs text-muted-foreground">{rows.length} products · {actions.length} actions</p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="ml-auto shrink-0">
                        <a href={exportUrl} download><DownloadIcon className="mr-2 size-4" /> Export CSV</a>
                    </Button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Decision legend">
                    <span><span className="mr-1 inline-block size-3 bg-green-600 align-middle" />Y</span>
                    <span><span className="mr-1 inline-block size-3 bg-red-600 align-middle" />N</span>
                    <span><span className="mr-1 inline-block size-3 bg-slate-300 align-middle" />NA</span>
                    <span><span className="mr-1 inline-block size-3 border border-dashed border-slate-500 bg-green-200 align-middle" />Draft</span>
                    <span><span className="mr-1 inline-block size-3 border border-dashed border-slate-400 align-middle" />Y? / NA? suggested</span>
                </div>
                <Tabs value={moduleGroup || '__all__'} onValueChange={(value) => setModuleGroup(value === '__all__' ? '' : value)} className="min-w-0">
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
                            onChange={(event) => setSearch(event.target.value)} className="pl-9" />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox checked={needsReview} onCheckedChange={(value) => setNeedsReview(value === true)} />
                        Needs review only
                    </label>
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
                    <div aria-busy={query.isFetching} className={`max-h-[72vh] min-w-0 max-w-full overflow-auto rounded-md border ${scrollbarClassName}`}>
                        {query.isFetching && <p className="sr-only" role="status">Updating matrix</p>}
                        <Table style={{ width: table.getTotalSize() }} className="table-fixed border-collapse text-xs">
                            <colgroup>
                                {leafColumns.map((column) => <col key={column.id} style={{ width: column.getSize() }} />)}
                            </colgroup>
                            <TableHeader className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900">
                                <TableRow className="border-b bg-slate-200 dark:bg-slate-800">
                                    <TableHead colSpan={productColumnCount} className="sticky left-0 z-30 border-r bg-slate-200 font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                                        Excursion/FMEA IDN
                                    </TableHead>
                                    {actions.map((action) => (
                                        <TableHead key={action.nbr} className="border-r bg-slate-200 text-center font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                                            {action.event_id || `#${action.nbr}`}
                                        </TableHead>
                                    ))}
                                </TableRow>
                                <TableRow className="border-b bg-slate-100 dark:bg-slate-900">
                                    {leafColumns.map((column) => (
                                        <TableHead key={column.id} style={{ width: column.getSize(), left: stickyColumns.has(column.id) ? column.getStart() : undefined }}
                                            className={`border-r bg-slate-100 align-top font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200 ${stickyClass(column, true)}`}>
                                            {column.columnDef.meta?.action ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span tabIndex={0} className="line-clamp-4 cursor-help break-words underline decoration-dotted underline-offset-2">
                                                            {column.columnDef.header}
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-sm whitespace-pre-line break-words">
                                                        {column.columnDef.header}{'\n'}Reference: {column.columnDef.meta.action.reference || '—'}
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : column.columnDef.header}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rowModel.rows.length ? rowModel.rows.map((row) => (
                                    <TableRow key={row.id} className="group border-b hover:bg-slate-50 dark:hover:bg-slate-900">
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} style={{ width: cell.column.getSize(), left: stickyColumns.has(cell.column.id) ? cell.column.getStart() : undefined }}
                                                className={`border-r align-top ${stickyClass(cell.column)} ${stickyColumns.has(cell.column.id) ? 'bg-background group-hover:bg-slate-50 dark:group-hover:bg-slate-900' : ''}`}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={leafColumns.length} className="h-32 text-center text-muted-foreground">
                                        {rows.length ? 'No products match.' : 'No Quality Matrix submissions yet'}
                                    </TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
                {editor && <RowEditor key={`${editor.row.product_key}::${editor.row.module_group}`}
                    row={editor.row} actions={actions} focusedAction={editor.actionNbr} onClose={() => setEditor(null)} />}
            </div>
        </TooltipProvider>
    );
}