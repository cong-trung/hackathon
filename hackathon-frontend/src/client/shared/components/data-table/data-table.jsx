import { useState } from 'react';
import PropTypes from 'prop-types';
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';

import DataTablePagination from '@/shared/components/data-table/pagination';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/components/ui/table';

import { scrollbarClassName } from '@/shared/utils/scrollbar';

function DataTable({
    columns,
    data = [],
    containerClassName = '',
    TableToolbar = null,
    TablePagination = DataTablePagination,
    manualPagination = false,
    paginationPageSize = 3,
    paginationArray = [1, 3, 5],
    tableRef = null,
}) {
    const [rowSelection, setRowSelection] = useState({});
    const [columnFilters, setColumnFilters] = useState([]);
    const [sorting, setSorting] = useState([]);
    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: paginationPageSize,
    });

    const table = useReactTable({
        data: Array.isArray(data) ? data : [],
        columns,
        state: {
            sorting,
            rowSelection,
            columnFilters,
            pagination,
        },
        initialState: {
            pagination: {
                pageIndex: 0,
                pageSize: paginationPageSize,
            },
        },
        manualPagination: manualPagination,
        autoResetPageIndex: false,
        enableRowSelection: true,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: (filters) => {
            setColumnFilters(filters);
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
        },
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    // Expose table instance to parent if tableRef is provided

    if (tableRef && typeof tableRef === 'object') {
        tableRef.current = table;
    }

    return (
        <div
            className={`space-y-4 w-full flex flex-col flex-1 max-w-[calc(100vw)] max-h-[calc(100vh-20%)] ${containerClassName}`}
        >
            {TableToolbar && <TableToolbar table={table} />}
            <div className={scrollbarClassName}>
                <Table className="w-full h-full">
                    <TableHeader className="sticky top-0 z-[10] bg-background">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead
                                            key={header.id}
                                            className="h-12"
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef
                                                          .header,
                                                      header.getContext(),
                                                  )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows &&
                        table.getRowModel().rows.length > 0 ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={
                                        row.getIsSelected() && 'selected'
                                    }
                                    className="transition-colors hover:bg-muted border-b h-16"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {TablePagination && (
                <TablePagination
                    table={table}
                    paginationArray={paginationArray}
                />
            )}
        </div>
    );
}

DataTable.propTypes = {
    columns: PropTypes.array.isRequired,
    data: PropTypes.array,
    containerClassName: PropTypes.string,
    TableToolbar: PropTypes.elementType,
    TablePagination: PropTypes.elementType,
    manualPagination: PropTypes.bool,
    paginationPageSize: PropTypes.number,
    paginationArray: PropTypes.arrayOf(PropTypes.number),
    tableRef: PropTypes.oneOfType([
        PropTypes.func,
        PropTypes.shape({ current: PropTypes.any }),
    ]),
};

const MemoizedDataTable = DataTable;
export default MemoizedDataTable;
