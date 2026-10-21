import { memo, useMemo, useEffect } from 'react';

import MemoizedDataTable from '@/shared/components/data-table/data-table';

import PageWithDataTableLayout from '@/shared/layout/PageWithDataTableLayout';

import { getColumns } from '../components/data-table/columns';
import { useHealthMutation } from '@/app/api/healthApi';

function HomePage() {
    const [triggerHealth, { data: healthData }] = useHealthMutation();

    useEffect(() => {
        triggerHealth();
    }, [triggerHealth]);

    console.log('health', healthData);
    const columns = useMemo(() => getColumns(), []);

    return (
        <PageWithDataTableLayout>
            <>
                <MemoizedDataTable
                    columns={columns}
                    data={[]}
                    containerClassName="max-w-[calc(100vw-4rem)]"
                    paginationPageSize={10}
                    paginationArray={[10, 20, 100]}
                />
            </>
        </PageWithDataTableLayout>
    );
}

export default memo(HomePage);
