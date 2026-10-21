import { DataTableColumnHeader } from '@/shared/components/data-table/column-header';
// import ViewDetails from '../ViewDetailsDialog';

export const getColumns = () => {
    return [
        {
            accessorKey: 'ticket_number',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Ticket #" />
            ),
            cell: ({ row }) => (
                <div className="font-medium ">
                    {row.getValue('ticket_number')}
                </div>
            ),
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'tool_name',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Tool" />
            ),
            cell: ({ row }) => <div>{row.getValue('tool_name')}</div>,
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'ticket_type',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Type" />
            ),
            cell: ({ row }) => <div>{row.getValue('ticket_type')}</div>,
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'to_name',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="To" />
            ),
            cell: ({ row }) => <div>{row.getValue('to_name')}</div>,
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'quantity',
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title="Hardware"
                    className={'justify-center w-full'}
                />
            ),
            cell: ({ row }) => (
                <div className="text-center">{row.getValue('quantity')}</div>
            ),
            enableSorting: false,
        },
        {
            accessorKey: 'status',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" />
            ),
            cell: ({ row }) => {
                const value = row.getValue('status');
                if (value === 'in_progress') {
                    return (
                        <div className="text-yellow-600 font-medium capitalize">
                            In Progress
                        </div>
                    );
                } else if (value === 'pending') {
                    return (
                        <div className="text-red-600 font-medium capitalize">
                            Pending
                        </div>
                    );
                }
                return <div>{value}</div>;
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'planners',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Plan" />
            ),
            cell: ({ row }) => {
                const value = row.getValue('planners');
                if (!value || typeof value !== 'object') return <div>-</div>;
                const entries = Object.entries(value);
                if (entries.length === 0) return <div>-</div>;
                return (
                    <div className="flex flex-col gap-0.5 text-xs">
                        {entries.map(([key, items]) => {
                            const summary = Array.isArray(items)
                                ? items
                                      .map((item) =>
                                          Object.entries(item)
                                              .map(([k, v]) => `${k} (${v})`)
                                              .join(', '),
                                      )
                                      .join(', ')
                                : String(items);
                            return (
                                <div key={key}>
                                    <span className="font-medium">{key}:</span>{' '}
                                    {summary}
                                </div>
                            );
                        })}
                    </div>
                );
            },
            enableSorting: false,
        },
        // {
        //     accessorKey: 'actions',
        //     header: ({ column }) => (
        //         <DataTableColumnHeader
        //             column={column}
        //             title=""
        //             className={'text-center w-[40px]'}
        //         />
        //     ),
        //     cell: ({ row }) => {
        //         return (
        //             <div className="font-medium text-center">
        //                 <ViewDetails row={row.original} />
        //             </div>
        //         );
        //     },
        //     enableSorting: false,
        // },
    ];
};
