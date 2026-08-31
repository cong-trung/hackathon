import { memo, useMemo } from 'react';

import MemoizedDataTable from '@/shared/components/data-table/data-table';

import DataTableToolbar from '../components/data-table/toolbar';

import PageWithDataTableLayout from '@/shared/layout/PageWithDataTableLayout';

import { getColumns } from '../components/data-table/columns';

import { useGetSolutionsQuery } from '@/app/api/solutionApi';

function LCBIPage() {
    const {
        data: lcbiData = [],
        isLoading: isLoadingLCBI,
        isError: isErrorLCBI,
    } = useGetSolutionsQuery('lcbi');

    const columns = useMemo(() => getColumns(), []);

    return (
        <PageWithDataTableLayout
            isLoading={isLoadingLCBI}
            isError={isErrorLCBI}
        >
            <>
                <MemoizedDataTable
                    columns={columns}
                    data={lcbiData.items || []}
                    TableToolbar={DataTableToolbar}
                    containerClassName=""
                    paginationPageSize={10}
                    paginationArray={[10, 20, 100]}
                />
            </>
        </PageWithDataTableLayout>
    );
}

export default memo(LCBIPage);
