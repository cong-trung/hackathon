import PropTypes from 'prop-types';
import AddButton from '../AddButton';

function DataTableToolbar() {
    return (
        <div className="flex items-center justify-between">
            <div className="flex-1" />
            <AddButton />
        </div>
    );
}

DataTableToolbar.propTypes = {
    table: PropTypes.object,
};

export default DataTableToolbar;
