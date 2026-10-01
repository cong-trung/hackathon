import { useDeferredValue, useMemo, useState } from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { ListChecksIcon, PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';

import { useGetActionItemsQuery } from '@/app/api/pypcsActionItemsApi';
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
    return (
        <div className="max-h-24 max-w-64 min-w-36 overflow-y-auto whitespace-pre-line break-words">
            {value || <span className="text-muted-foreground">-</span>}
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
                        className="max-w-full whitespace-normal break-words text-left"
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
    nbr: 'sticky left-0 z-10 w-16 min-w-16 bg-background',
    ar_follow_up: 'sticky left-16 z-10 w-36 min-w-36 bg-background',
    actionable_item: 'sticky left-52 z-10 w-52 min-w-52 bg-background',
};

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

export default function View2Page() {
    const { data, isLoading, isError, refetch } = useGetActionItemsQuery();
    const [search, setSearch] = useState('');
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
    const table = useReactTable({
        data: filtered,
        columns,
        meta: { onEdit: setActiveItem },
        getRowId: (row) => String(row.nbr),
        getCoreRowModel: getCoreRowModel(),
    });
    const rowModel = table.getRowModel();

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold">
                        <ListChecksIcon className="size-5 text-slate-600" /> View 2
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
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                />
            </div>

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
                    <Table style={{ width: table.getTotalSize() }} className="table-fixed border-collapse text-sm">
                        <TableHeader className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900">
                            <TableRow className="h-10 border-b">
                                {table.getAllLeafColumns().slice(0, 5).map((column) => (
                                    <TableHead
                                        key={column.id}
                                        rowSpan={2}
                                        style={{ width: column.getSize() }}
                                        className={`align-middle font-semibold text-slate-700 dark:text-slate-200 ${frozen[column.id] || ''} ${frozen[column.id] ? '!z-30 !bg-slate-100 dark:!bg-slate-900' : ''}`}
                                    >
                                        {column.columnDef.header}
                                    </TableHead>
                                ))}
                                <TableHead colSpan={7} className="border-x text-center font-semibold text-slate-700 dark:text-slate-200">
                                    Applicability (Quality Matrix questions)
                                </TableHead>
                                {table.getAllLeafColumns().slice(12).map((column) => (
                                    <TableHead key={column.id} rowSpan={2} style={{ width: column.getSize() }} className="align-middle font-semibold text-slate-700 dark:text-slate-200">
                                        {column.columnDef.header}
                                    </TableHead>
                                ))}
                            </TableRow>
                            <TableRow className="h-10 border-b">
                                {table.getAllLeafColumns().slice(5, 12).map((column) => (
                                    <TableHead key={column.id} style={{ width: column.getSize() }} className="border-l font-semibold text-slate-700 dark:text-slate-200">
                                        {column.columnDef.header}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rowModel.rows.length ? (
                                rowModel.rows.map((row) => (
                                    <TableRow key={row.id} className="group border-b hover:bg-slate-50 dark:hover:bg-slate-900">
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell
                                                key={cell.id}
                                                style={{ width: cell.column.getSize() }}
                                                className={`align-top border-r py-3 ${frozen[cell.column.id] || ''} ${frozen[cell.column.id] ? 'group-hover:bg-slate-50 dark:group-hover:bg-slate-900' : ''}`}
                                            >
                                                {flexRender(cell.column.columnDef.cell ?? DefaultCell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={17} className="h-32 text-center text-muted-foreground">
                                        {term ? 'No action items match your search.' : 'No action items yet.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

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