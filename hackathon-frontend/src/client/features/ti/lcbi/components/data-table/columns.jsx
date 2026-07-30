import { DataTableColumnHeader } from '@/shared/components/data-table/column-header';

export const getColumns = () => {
    return [
        {
            accessorKey: 'product',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Product" />
            ),
            cell: ({ row }) => (
                <div className="font-medium text-wrap">
                    {row.getValue('product')}
                </div>
            ),
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'prodgroup3',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="ProdGroup3" />
            ),
            cell: ({ row }) => <div>{row.getValue('prodgroup3')}</div>,
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'module',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Module" />
            ),
            cell: ({ row }) => <div>{row.getValue('module')}</div>,
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'pkg',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Package" />
            ),
            cell: ({ row }) => {
                return <div>{row.getValue('pkg')}</div>;
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'pkg_1',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Package (1)" />
            ),
            cell: ({ row }) => {
                return <div>{row.getValue('pkg_1')}</div>;
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'prd_seg',
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title="Product Segment"
                />
            ),
            cell: ({ row }) => {
                return <div>{row.getValue('prd_seg')}</div>;
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'fab_tech',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Fab Technology" />
            ),
            cell: ({ row }) => {
                return <div>{row.getValue('fab_tech')}</div>;
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
    ];
};
