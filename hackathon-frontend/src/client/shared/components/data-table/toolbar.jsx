import { X } from 'lucide-react';
import PropTypes from 'prop-types';

import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';

function DataTableToolbar({ table, columnFiltered, actionButton }) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {columnFiltered && (
          <>
            <Input
              placeholder={`Lọc theo cột ${columnFiltered}`}
              value={table.getColumn(columnFiltered)?.getFilterValue() || ''}
              onChange={(event) =>
                table
                  .getColumn(columnFiltered)
                  ?.setFilterValue(event.target.value)
              }
              className="h-8 w-[150px] lg:w-[250px]"
            />
            {isFiltered && (
              <Button
                variant="ghost"
                onClick={() => {
                  table.resetColumnFilters();
                  table.getColumn(columnFiltered)?.setFilterValue('');
                }}
                className="h-8 px-2 lg:px-3"
              >
                Reset
                <X className="ml-2 h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
      {actionButton && <div className="flex-shrink-0">{actionButton}</div>}
    </div>
  );
}

DataTableToolbar.propTypes = {
  table: PropTypes.object.isRequired,
  columnFiltered: PropTypes.string,
  actionButton: PropTypes.node,
};

export default DataTableToolbar;
