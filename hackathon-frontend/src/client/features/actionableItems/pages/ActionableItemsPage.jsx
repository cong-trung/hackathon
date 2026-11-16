import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authErrorMessage, loginPath, useAuth } from '@/shared/hooks/useAuth';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { ArrowDown, ArrowDownUp, ArrowUp, PencilIcon, PlusIcon, SearchIcon, Trash2 } from 'lucide-react';

import { useDeleteActionItemMutation, useGetActionItemsMetaQuery, useGetActionItemsPageQuery } from '@/app/api/pypcsActionItemsApi';
import ServerPagination from '@/shared/components/data-table/ServerPagination';
import LazyTabs from '@/shared/components/lazy-tabs/LazyTabs';
import useServerTable from '@/shared/hooks/useServerTable';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/components/ui/table';
import { scrollbarClassName } from '@/shared/utils/scrollbar';
import ActionItemForm from '../components/ActionItemForm';

const EMPTY = [];

const applicability = [
    ['package', 'Package'],
    ['bare_die_lid', 'Bare die / Lid'],
    ['foveros', 'Foveros'],
    ['segment', 'Segment'],
    ['xvi_tool_type', 'xVI tool type'],
    ['lts_ball', 'LTS ball'],
    ['hdmx_ap_pan', 'HDMx AP Pan'],
];

function TextCell({ value }) {
    const [expanded, setExpanded] = useState(false);
    const longText = String(value ?? '').length > 120;
    return (
        <div className="min-w-0 [overflow-wrap:anywhere]">
            <div className={`whitespace-pre-line ${longText && !expanded ? 'line-clamp-3' : ''}`}>
                {value || <span className="text-muted-foreground">-</span>}
            </div>
            {longText && <button type="button" aria-expanded={expanded}
                className="mt-1 text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Show less' : 'Show more'}
            </button>}
        </div>
    );
}

function BadgesCell({ values, comment }) {
    return (
        <div className="flex min-w-28 max-w-48 flex-wrap gap-1">
            {values?.length ? (
                values.map((value) => (
                    <Badge
                        key={value}
                        variant={value === 'All' || value === 'NA' ? 'secondary' : 'outline'}
                        className="max-w-full whitespace-normal border-primary/30 bg-primary/5 text-left text-foreground [overflow-wrap:anywhere]"
                    >
                        {value}
                    </Badge>
                ))
            ) : (
                <span className="text-muted-foreground">-</span>
            )}
            {values?.includes('Multiple') && comment && (
                <span className="w-full whitespace-pre-line break-words text-xs text-muted-foreground">
                    {comment}
                </span>
            )}
        </div>
    );
}

const frozen = {
    actions: 'sticky z-10 bg-table-frozen group-even:bg-table-stripe group-hover:bg-table-hover',
    nbr: 'sticky z-10 border-r-2 bg-table-frozen shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] group-even:bg-table-stripe group-hover:bg-table-hover lg:border-r lg:shadow-none',
    event_id: 'lg:sticky lg:z-10 lg:bg-table-frozen lg:group-even:bg-table-stripe lg:group-hover:bg-table-hover',
    actionable_item: 'lg:sticky lg:z-10 lg:border-r-2 lg:bg-table-frozen lg:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] lg:group-even:bg-table-stripe lg:group-hover:bg-table-hover',
};

function columnStyle(column) {
    const width = column.getSize();
    return {
        width,
        minWidth: width,
        maxWidth: width,
        ...(frozen[column.id] ? { left: column.getStart() } : {}),
    };
}

function TextValueCell({ getValue }) {
    return <TextCell value={getValue()} />;
}

function ApplicabilityValueCell({ row, getValue, column }) {
    return (
        <BadgesCell
            values={getValue()}
            comment={column.id === 'xvi_tool_type' ? row.original.xvi_tool_comment : ''}
        />
    );
}

function UpdatedAtCell({ getValue }) {
    return (
        <span className="whitespace-nowrap text-muted-foreground">
            {getValue() ? new Date(getValue()).toLocaleString() : '-'}
        </span>
    );
}

function ActionCell({ row, table }) {
    if (!table.options.meta.canEdit) return null;
    return (
        <div className="flex items-center gap-1">
            <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-7 shrink-0"
                aria-label={`Edit item NBr# ${row.original.nbr}`}
                onClick={() => table.options.meta.onEdit(row.original)}
            >
                <PencilIcon aria-hidden="true" className="size-3.5" />
            </Button>
            {table.options.meta.canDelete && (
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-7 shrink-0 text-destructive hover:text-destructive"
                    aria-label={`Delete item NBr# ${row.original.nbr}`}
                    onClick={() => table.options.meta.onDelete(row.original)}
                >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
            )}
        </div>
    );
}

function DefaultCell({ getValue }) {
    return getValue();
}

function columnsFor(showHdmxApPan) {
    const text = (key, title, size = 210) => ({
        accessorKey: key,
        header: title,
        size,
        cell: TextValueCell,
    });

    return [
        {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            size: 72,
            cell: ActionCell,
        },
        { accessorKey: 'nbr', header: 'NBr#', size: 64 },
        text('event_id', 'Event ID', 120),
        text('actionable_item', 'Actionable item', 200),
        { accessorKey: 'module', header: 'Module', size: 175, cell: ApplicabilityValueCell },
        text('reference', 'Reference', 240),
        text('description', 'Description', 240),
        ...applicability.filter(([key]) => key !== 'hdmx_ap_pan' || showHdmxApPan).map(([key, title]) => ({
            accessorKey: key,
            header: title,
            size: 175,
            cell: ApplicabilityValueCell,
        })),
        text('owner', 'Owner', 150),
        text('update_by', 'Update by', 150),
        text('scenario', 'Scenario', 230),
        {
            accessorKey: 'updated_at',
            header: 'Updated at',
            size: 180,
            cell: UpdatedAtCell,
        },
    ];
}

const sortableColumns = new Set(['nbr', 'event_id', 'actionable_item', 'owner', 'updated_at']);

export default function ActionableItemsPage() {
    const { isAuthenticated, permissions, isAdmin } = useAuth();
    const canEdit = Boolean(permissions.can_edit_action_items);
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const metaQuery = useGetActionItemsMetaQuery();
    const tabs = metaQuery.data?.tabs ?? EMPTY;
    const requestedModule = searchParams.get('module');
    const selectedModule = tabs.some((tab) => tab.key === requestedModule)
        ? requestedModule : tabs.find((tab) => tab.count > 0)?.key ?? tabs[0]?.key ?? '';
    const tableState = useServerTable({ tabKey: selectedModule, initialSort: 'nbr', initialDir: 'asc' });
    const { currentData: data, isLoading, isFetching, isError, refetch } = useGetActionItemsPageQuery(
        { module: selectedModule, ...tableState.args }, { skip: !selectedModule },
    );
    const loadingPage = isLoading || (isFetching && !data);
    const [deleteActionItem, { isLoading: isDeleting }] = useDeleteActionItemMutation();
    const searchRef = useRef(null);
    const deletedRef = useRef(false);
    const [activeItem, setActiveItem] = useState(undefined);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    const visibleItems = data?.items ?? EMPTY;
    const columns = useMemo(() => columnsFor(selectedModule.toLowerCase() === 'hdmx'), [selectedModule]);
    const table = useReactTable({
        data: visibleItems,
        columns,
        meta: {
            onEdit: (item) => { if (canEdit) setActiveItem(item); },
            canEdit,
            onDelete: (item) => { deletedRef.current = false; setDeleteError(''); setPendingDelete(item); },
            canDelete: isAdmin,
        },
        getRowId: (row) => String(row.nbr),
        getCoreRowModel: getCoreRowModel(),
    });
    const rowModel = table.getRowModel();
    const leafColumns = table.getAllLeafColumns();
    const applicabilityStart = leafColumns.findIndex((column) => column.id === applicability[0][0]);
    const applicabilityEnd = leafColumns.findIndex((column) => column.id === 'owner');

    async function confirmDelete() {
        if (!pendingDelete || isDeleting) return;
        setDeleteError('');
        try {
            await deleteActionItem({ nbr: pendingDelete.nbr, expectedVersion: pendingDelete.version }).unwrap();
            if (visibleItems.length === 1 && tableState.offset > 0) {
                tableState.setOffset(Math.max(0, tableState.offset - tableState.limit));
            }
            deletedRef.current = true;
            setPendingDelete(null);
        } catch (error) {
            setDeleteError(error?.status === 409
                ? error.data?.detail?.message ?? 'This item changed. Reload the page and try again.'
                : error?.status === 401 || error?.status === 403
                  ? authErrorMessage(error)
                  : error?.status === 404
                    ? 'This action item no longer exists.'
                    : 'Could not delete the action item. Please try again.');
        }
    }

    function renderHeader(column) {
        if (!sortableColumns.has(column.id)) return column.columnDef.header;
        const direction = tableState.sort === column.id ? (tableState.dir === 'asc' ? 'ascending' : 'descending') : 'none';
        const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowDownUp;
        return (
            <button type="button" className="inline-flex items-center gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={() => tableState.changeSort(column.id)}>
                {column.columnDef.header}<Icon aria-hidden="true" className="size-4 shrink-0" />
            </button>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-3 md:h-full md:min-h-0 md:overflow-hidden">
            <h1 className="sr-only">Actionable Items</h1>
            {metaQuery.isError && <div role="alert">Could not load modules. <Button variant="outline" onClick={metaQuery.refetch}>Retry</Button></div>}
            <LazyTabs tabs={tabs} activeKey={selectedModule} urlParam="module" loading={!metaQuery.data}
                onChange={() => tableState.resetOffset()} renderPanel={() => (<>
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-sm">
                <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    ref={searchRef}
                    type="search"
                    aria-label="Search action items"
                    placeholder="Search action items"
                    value={tableState.search}
                    onChange={(event) => tableState.setSearch(event.target.value)}
                    className="pl-9"
                />
                </div>
                <span role="status" aria-live="polite" className="text-sm text-muted-foreground">{data?.total ?? 0} action items found</span>
                {!isAuthenticated && <Link className="ml-auto text-sm underline" to={loginPath(location.pathname + location.search)}>Log in to edit</Link>}
                {canEdit && <Button size="sm" className="ml-auto" onClick={() => setActiveItem(null)}>
                    <PlusIcon className="mr-2 size-4" /> Add new item
                </Button>}
            </div>

            {isError ? (
                <div role="alert" className="rounded-md border border-destructive/30 p-5 text-sm text-destructive">
                    Could not load action items.{' '}
                    <Button type="button" variant="outline" onClick={refetch}>
                        Retry
                    </Button>
                </div>
            ) : loadingPage ? (
                <div aria-label="Loading action items" className="space-y-3 rounded-md border p-4">
                    <Skeleton className="h-10 w-full" />
                    {[1, 2, 3, 4].map((row) => (
                        <Skeleton key={row} className="h-16 w-full" />
                    ))}
                </div>
            ) : (
                <div className={`min-h-[320px] min-w-0 max-w-full overflow-auto rounded-md border border-table-border md:min-h-0 md:flex-1 ${scrollbarClassName}`}>
                    <Table style={{ width: table.getTotalSize() }} className="table-fixed border-separate border-spacing-0 text-sm">
                        <colgroup>
                            {leafColumns.map((column) => (
                                <col key={column.id} style={{ width: column.getSize() }} />
                            ))}
                        </colgroup>
                        <TableHeader className="sticky top-0 z-20 bg-table-header text-table-header-foreground">
                            <TableRow className="h-10 border-b bg-table-header hover:bg-table-header">
                                {leafColumns.slice(0, applicabilityStart).map((column) => (
                                    <TableHead
                                        key={column.id}
                                        rowSpan={2}
                                        aria-sort={sortableColumns.has(column.id) ? (tableState.sort === column.id ? (tableState.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                                        style={columnStyle(column)}
                                        className={`border-b border-r border-white/20 align-middle font-semibold text-table-header-foreground ${frozen[column.id] || ''} ${frozen[column.id] ? '!z-30 !bg-table-header' : ''}`}
                                    >
                                        {renderHeader(column)}
                                    </TableHead>
                                ))}
                                <TableHead colSpan={applicabilityEnd - applicabilityStart} className="border-b border-r border-table-border bg-table-subheader text-center font-semibold text-table-subheader-foreground">
                                    Applicability (Product Info questions)
                                </TableHead>
                                {leafColumns.slice(applicabilityEnd).map((column) => (
                                    <TableHead key={column.id} rowSpan={2} aria-sort={sortableColumns.has(column.id) ? (tableState.sort === column.id ? (tableState.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined} style={columnStyle(column)} className="border-b border-r border-white/20 align-middle font-semibold text-table-header-foreground">
                                        {renderHeader(column)}
                                    </TableHead>
                                ))}
                            </TableRow>
                            <TableRow className="h-10 border-b bg-table-header hover:bg-table-header">
                                {leafColumns.slice(applicabilityStart, applicabilityEnd).map((column) => (
                                    <TableHead key={column.id} style={columnStyle(column)} className="border-b border-r border-white/20 font-semibold text-table-header-foreground">
                                        {column.columnDef.header}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rowModel.rows.length ? (
                                rowModel.rows.map((row) => (
                                    <TableRow key={row.id} className="group even:bg-table-stripe hover:bg-table-hover">
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell
                                                key={cell.id}
                                                style={columnStyle(cell.column)}
                                                className={`border-b border-r border-table-border py-3 align-top [overflow-wrap:anywhere] ${cell.column.id === 'actions' ? 'px-1' : ''} ${frozen[cell.column.id] || ''}`}
                                            >
                                                {flexRender(cell.column.columnDef.cell ?? DefaultCell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={leafColumns.length} className="h-32 text-center text-muted-foreground">
                                        {tableState.args.q ? <>No matching actionable items in {selectedModule}.{' '}
                                            <Button type="button" variant="outline" size="sm" onClick={() => tableState.setSearch('')}>Clear filters</Button>
                                        </> : selectedModule ? `No actionable items tagged for ${selectedModule}.` : 'No actionable items yet.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            {!loadingPage && !isError && <ServerPagination label="Action items" total={data?.total ?? 0}
                limit={tableState.limit} offset={tableState.offset} onOffsetChange={tableState.setOffset} onLimitChange={tableState.changeLimit} />}
            </>)} />

            {canEdit && activeItem !== undefined && (
                <ActionItemForm
                    key={activeItem?.nbr ?? 'new'}
                    item={activeItem}
                    onReload={async () => {
                        const latest = await refetch().unwrap();
                        const item = latest.items.find((entry) => entry.nbr === activeItem.nbr);
                        if (!item) throw new Error('Action item is no longer on this page.');
                        return item;
                    }}
                    onClose={() => setActiveItem(undefined)}
                />
            )}
            <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open && !isDeleting) setPendingDelete(null); }}>
                <AlertDialogContent onCloseAutoFocus={(event) => {
                    if (deletedRef.current) {
                        event.preventDefault();
                        searchRef.current?.focus();
                        deletedRef.current = false;
                    }
                }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete item NBr# {pendingDelete?.nbr}?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        {deleteError && <p role="alert" className="mr-auto text-sm text-destructive">{deleteError}</p>}
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(event) => { event.preventDefault(); confirmDelete(); }}>
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}