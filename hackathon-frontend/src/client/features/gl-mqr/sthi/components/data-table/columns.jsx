import { DataTableColumnHeader } from '@/shared/components/data-table/column-header';

export const getColumns = () => {
    return [
        {
            accessorKey: 'module',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Module" />
            ),
            cell: ({ row }) => (
                <div className="font-medium text-wrap">
                    {row.getValue('module')}
                </div>
            ),
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'solution',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Solution" />
            ),
            cell: ({ row }) => (
                <div className="w-[200px]">{row.getValue('solution')}</div>
            ),
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'key_summary',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Key Summary" />
            ),
            cell: ({ row }) => (
                <div className="w-[700px]">{row.getValue('key_summary')}</div>
            ),
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'excursion_related',
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title="Excursion Related"
                />
            ),
            cell: ({ row }) => {
                return <div>{row.getValue('excursion_related')}</div>;
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
    ];
};
