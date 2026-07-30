import { X } from 'lucide-react';
import PropTypes from 'prop-types';

import { Button } from '@/shared/components/ui/button';
import AddButton from '../AddButton';
import DataTableFacetedFilter from './faceted-filter';

function DataTableToolbar({ table }) {
    const isFiltered = table.getState().columnFilters.length > 0;

    const productOptions = [
        ...new Set(
            table
                .getCoreRowModel()
                .rows.map((r) => r.getValue('product'))
                .filter(Boolean),
        ),
    ].map((v) => ({ id: v, name: v }));

    const prodgrp3Options = [
        ...new Set(
            table
                .getCoreRowModel()
                .rows.map((r) => r.getValue('prodgroup3'))
                .filter(Boolean),
        ),
    ].map((v) => ({ id: v, name: v }));

    return (
        <div className="flex items-center justify-between">
            <div className="flex flex-1 items-center space-x-2">
                {table.getColumn('product') && (
                    <DataTableFacetedFilter
                        column={table.getColumn('product')}
                        title="Product"
                        options={productOptions}
                    />
                )}
                {table.getColumn('prodgroup3') && (
                    <DataTableFacetedFilter
                        column={table.getColumn('prodgroup3')}
                        title="ProdGroup3"
                        options={prodgrp3Options}
                    />
                )}
                {isFiltered && (
                    <Button
                        variant="ghost"
                        onClick={() => table.resetColumnFilters()}
                        className="h-8 px-2 lg:px-3"
                    >
                        Reset
                        <X className="ml-2 h-4 w-4" />
                    </Button>
                )}
            </div>
            <AddButton />
        </div>
    );
}

DataTableToolbar.propTypes = {
    table: PropTypes.object.isRequired,
};

export default DataTableToolbar;
