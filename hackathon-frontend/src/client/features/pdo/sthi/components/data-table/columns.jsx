import { DataTableColumnHeader } from '@/shared/components/data-table/column-header';

export const getColumns = () => {
    return [
        {
            accessorKey: 'product',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Product" />
            ),
            cell: ({ row }) => (
                <div className="font-medium ">{row.getValue('product')}</div>
            ),
            filterFn: 'arrIncludesSome',
            enableSorting: false,
        },
        {
            accessorKey: 'prodgroup3',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="ProdGroup3" />
            ),
            cell: ({ row }) => <div>{row.getValue('prodgroup3')}</div>,
            filterFn: 'arrIncludesSome',
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
            accessorKey: 'nsb',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="NSB" />
            ),
            cell: ({ row }) => <div>{row.getValue('nsb')}</div>,
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'mcp',
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title="MCP"
                    className={'justify-center w-full'}
                />
            ),
            cell: ({ row }) => (
                <div className="text-center">{row.getValue('mcp')}</div>
            ),
            enableSorting: false,
        },
        {
            accessorKey: 'pkg',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Package" />
            ),
            cell: ({ row }) => {
                return <div className="text-center">{row.getValue('pkg')}</div>;
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
                return (
                    <div className="text-center">{row.getValue('pkg_1')}</div>
                );
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
                return (
                    <div className="text-center">{row.getValue('prd_seg')}</div>
                );
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'xvi_tool_type',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="xVI tool type" />
            ),
            cell: ({ row }) => {
                return (
                    <div className="text-center">
                        {row.getValue('xvi_tool_type')}
                    </div>
                );
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
                return (
                    <div className="text-center">
                        {row.getValue('fab_tech')}
                    </div>
                );
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'thermal_tech',
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title="Thermal Technology"
                />
            ),
            cell: ({ row }) => {
                return (
                    <div className="text-center">
                        {row.getValue('thermal_tech')}
                    </div>
                );
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'sw_platform',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="SW platform" />
            ),
            cell: ({ row }) => {
                return (
                    <div className="text-center">
                        {row.getValue('sw_platform')}
                    </div>
                );
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'lts_ball',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="LTS ball" />
            ),
            cell: ({ row }) => {
                return (
                    <div className="text-center">
                        {row.getValue('lts_ball')}
                    </div>
                );
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'fusion_or_apse',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Fusion or Apse" />
            ),
            cell: ({ row }) => {
                return (
                    <div className="text-center">
                        {row.getValue('fusion_or_apse')}
                    </div>
                );
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
        {
            accessorKey: 'socket_type',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Socket Type" />
            ),
            cell: ({ row }) => {
                return (
                    <div className="text-center">
                        {row.getValue('socket_type')}
                    </div>
                );
            },
            filterFn: 'includesString',
            enableSorting: false,
        },
    ];
};
