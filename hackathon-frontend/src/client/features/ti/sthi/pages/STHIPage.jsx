import { memo, useMemo } from 'react';

import MemoizedDataTable from '@/shared/components/data-table/data-table';

import DataTableToolbar from '../components/data-table/toolbar';

import PageWithDataTableLayout from '@/shared/layout/PageWithDataTableLayout';

import { getColumns } from '../components/data-table/columns';

import { useGetTISTHIQuery } from '@/app/api/tiApi';

function STHIPage() {
    const {
        data: sthiData = [],
        isLoading: isLoadingSTHI,
        isError: isErrorSTHI,
    } = useGetTISTHIQuery();

    const columns = useMemo(() => getColumns(), []);

    return (
        <PageWithDataTableLayout
            isLoading={isLoadingSTHI}
            isError={isErrorSTHI}
        >
            <>
                <MemoizedDataTable
                    columns={columns}
                    data={sthiData.items || []}
                    TableToolbar={DataTableToolbar}
                    containerClassName=""
                    paginationPageSize={10}
                    paginationArray={[10, 20, 100]}
                />
            </>
        </PageWithDataTableLayout>
    );
}

export default memo(STHIPage);
