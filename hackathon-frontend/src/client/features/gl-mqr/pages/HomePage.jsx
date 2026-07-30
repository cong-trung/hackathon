import { memo, useMemo } from 'react';

import MemoizedDataTable from '@/shared/components/data-table/data-table';

import DataTableToolbar from '../components/data-table/toolbar';

import PageWithDataTableLayout from '@/shared/layout/PageWithDataTableLayout';

import { getColumns } from '../components/data-table/columns';

function HomePage() {
    const columns = useMemo(() => getColumns(), []);

    return (
        <PageWithDataTableLayout>
            <>
                <DataTableToolbar />
                <MemoizedDataTable
                    columns={columns}
                    data={[]}
                    containerClassName="max-h-[calc(100vh-8.2rem)]"
                    paginationPageSize={10}
                    paginationArray={[10, 20, 100]}
                />
            </>
        </PageWithDataTableLayout>
    );
}

export default memo(HomePage);
