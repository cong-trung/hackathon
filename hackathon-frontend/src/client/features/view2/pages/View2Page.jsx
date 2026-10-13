import { useDeferredValue, useMemo, useState } from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { ArrowDown, ArrowDownUp, ArrowUp, ListChecksIcon, PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';

import { useGetActionItemsQuery } from '@/app/api/pypcsActionItemsApi';
import ClientPagination from '@/shared/components/data-table/ClientPagination';
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
    nbr: 'sticky z-10 bg-table-frozen group-hover:bg-table-hover',
    event_id: 'sticky z-10 border-r-2 bg-table-frozen shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] group-hover:bg-table-hover lg:border-r lg:shadow-none',
    ar_follow_up: 'lg:sticky lg:z-10 lg:bg-table-frozen lg:group-hover:bg-table-hover',
    actionable_item: 'lg:sticky lg:z-10 lg:border-r-2 lg:bg-table-frozen lg:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] lg:group-hover:bg-table-hover',
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
    return (
        <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => table.options.meta.onEdit(row.original)}
        >
            <PencilIcon className="mr-1 size-3.5" /> Edit
            <span className="sr-only"> item NBr# {row.original.nbr}</span>
        </Button>
    );
}

function DefaultCell({ getValue }) {
    return getValue();
}

function columnsFor() {
    const text = (key, title, size = 210) => ({
        accessorKey: key,
        header: title,
        size,
        cell: TextValueCell,
    });

    return [
        { accessorKey: 'nbr', header: 'NBr#', size: 64 },
        text('event_id', 'Event ID', 144),
        text('ar_follow_up', 'AR follow up', 144),
        text('actionable_item', 'Actionable item', 208),
        text('reference', 'Reference', 240),
        text('description', 'Description', 240),
        ...applicability.map(([key, title]) => ({
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
        {
            id: 'actions',
            header: 'Actions',
            size: 100,
            cell: ActionCell,
        },
    ];
}

const columns = columnsFor();
const sortableColumns = new Set(['nbr', 'event_id', 'actionable_item', 'owner', 'updated_at']);

export default function View2Page() {
    const { data, isLoading, isError, refetch } = useGetActionItemsQuery();
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ key: 'nbr', direction: 'ascending' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [activeItem, setActiveItem] = useState(undefined);
    const items = data?.items ?? EMPTY;
    const deferredSearch = useDeferredValue(search);
    const term = deferredSearch.trim().toLowerCase();
    const searchIndex = useMemo(
        () => new Map(items.map((item) => [
            item,
            Object.values(item).map((value) =>
                (Array.isArray(value) ? value.join(' ') : String(value ?? '')).toLowerCase(),
            ),
        ])),
        [items],
    );
    const filtered = useMemo(
        () => term
            ? items.filter((item) => searchIndex.get(item).some((value) => value.includes(term)))
            : items,
        [items, searchIndex, term],
    );
    const sorted = useMemo(() => [...filtered].sort((first, second) => {
        const left = sort.key === 'updated_at' ? Date.parse(first.updated_at) || 0 : first[sort.key];
        const right = sort.key === 'updated_at' ? Date.parse(second.updated_at) || 0 : second[sort.key];
        const comparison = typeof left === 'number' && typeof right === 'number'
            ? left - right : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
        return sort.direction === 'ascending' ? comparison : -comparison;
    }), [filtered, sort]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(sorted.length / pageSize)));
    const visibleItems = useMemo(
        () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [sorted, currentPage, pageSize],
    );
    const table = useReactTable({
        data: visibleItems,
        columns,
        meta: { onEdit: setActiveItem },
        getRowId: (row) => String(row.nbr),
        getCoreRowModel: getCoreRowModel(),
    });
    const rowModel = table.getRowModel();

    function renderHeader(column) {
        if (!sortableColumns.has(column.id)) return column.columnDef.header;
        const direction = sort.key === column.id ? sort.direction : 'none';
        const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowDownUp;
        return (
            <button type="button" className="inline-flex items-center gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={() => {
                    setSort({ key: column.id, direction: direction === 'ascending' ? 'descending' : 'ascending' });
                    setPage(1);
                }}>
                {column.columnDef.header}<Icon aria-hidden="true" className="size-4 shrink-0" />
            </button>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold">
                        <ListChecksIcon className="size-5 text-primary" /> View 2
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        PYPCS action items · {isLoading ? 'Loading' : `${data?.count ?? items.length} items`}
                    </p>
                </div>
                <Button onClick={() => setActiveItem(null)}>
                    <PlusIcon className="mr-2 size-4" /> Add new item
                </Button>
            </div>

            <div className="relative w-full max-w-sm">
                <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="search"
                    aria-label="Search action items"
                    placeholder="Search action items"
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    className="pl-9"
                />
            </div>
            <span role="status" aria-live="polite" className="text-sm text-muted-foreground">{filtered.length} action items found</span>

            {isError ? (
                <div role="alert" className="rounded-md border border-destructive/30 p-5 text-sm text-destructive">
                    Could not load action items.{' '}
                    <Button type="button" variant="outline" onClick={refetch}>
                        Retry
                    </Button>
                </div>
            ) : isLoading ? (
                <div aria-label="Loading action items" className="space-y-3 rounded-md border p-4">
                    <Skeleton className="h-10 w-full" />
                    {[1, 2, 3, 4].map((row) => (
                        <Skeleton key={row} className="h-16 w-full" />
                    ))}
                </div>
            ) : (
                <div className={`max-h-[72vh] min-w-0 max-w-full overflow-auto rounded-md border ${scrollbarClassName}`}>
                    <Table style={{ width: table.getTotalSize() }} className="table-fixed border-separate border-spacing-0 text-sm">
                        <colgroup>
                            {table.getAllLeafColumns().map((column) => (
                                <col key={column.id} style={{ width: column.getSize() }} />
                            ))}
                        </colgroup>
                        <TableHeader className="sticky top-0 z-20 bg-table-header text-table-header-foreground">
                            <TableRow className="h-10 border-b bg-table-header hover:bg-table-header">
                                {table.getAllLeafColumns().slice(0, 6).map((column) => (
                                    <TableHead
                                        key={column.id}
                                        rowSpan={2}
                                        aria-sort={sortableColumns.has(column.id) ? (sort.key === column.id ? sort.direction : 'none') : undefined}
                                        style={columnStyle(column)}
                                        className={`border-b border-r align-middle font-semibold text-table-header-foreground ${frozen[column.id] || ''} ${frozen[column.id] ? '!z-30 !bg-table-header' : ''}`}
                                    >
                                        {renderHeader(column)}
                                    </TableHead>
                                ))}
                                <TableHead colSpan={7} className="border-b border-r bg-table-subheader text-center font-semibold text-table-subheader-foreground">
                                    Applicability (Quality Matrix questions)
                                </TableHead>
                                {table.getAllLeafColumns().slice(13).map((column) => (
                                    <TableHead key={column.id} rowSpan={2} aria-sort={sortableColumns.has(column.id) ? (sort.key === column.id ? sort.direction : 'none') : undefined} style={columnStyle(column)} className="border-b border-r align-middle font-semibold text-table-header-foreground">
                                        {renderHeader(column)}
                                    </TableHead>
                                ))}
                            </TableRow>
                            <TableRow className="h-10 border-b bg-table-header hover:bg-table-header">
                                {table.getAllLeafColumns().slice(6, 13).map((column) => (
                                    <TableHead key={column.id} style={columnStyle(column)} className="border-b border-r font-semibold text-table-header-foreground">
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
                                                className={`border-b border-r py-3 align-top [overflow-wrap:anywhere] ${frozen[cell.column.id] || ''}`}
                                            >
                                                {flexRender(cell.column.columnDef.cell ?? DefaultCell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={18} className="h-32 text-center text-muted-foreground">
                                        {term ? <>No matching action items.{' '}
                                            <Button type="button" variant="outline" size="sm" onClick={() => { setSearch(''); setPage(1); }}>Clear filters</Button>
                                        </> : 'No action items yet.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            {!isLoading && !isError && <ClientPagination label="Action items" total={sorted.length} page={currentPage}
                pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}

            {activeItem !== undefined && (
                <ActionItemForm
                    key={activeItem?.nbr ?? 'new'}
                    item={activeItem}
                    onClose={() => setActiveItem(undefined)}
                />
            )}
        </div>
    );
}