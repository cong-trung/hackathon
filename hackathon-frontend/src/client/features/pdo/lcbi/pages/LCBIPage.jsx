import { memo, useMemo } from 'react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/components/ui/table';
import { scrollbarClassName } from '@/shared/utils/scrollbar';
import AddButton from '../components/AddButton';
import { useGetPdSolutionQuery } from '@/app/api/pdSolutionApi';

function LCBIPage() {
    const {
        data: pdSolutionData,
        isLoading,
        isError,
    } = useGetPdSolutionQuery('lcbi');

    const items = pdSolutionData?.items ?? {};
    const prodgrp3List = Object.keys(items);

    // derive ordered solution columns from first entry
    const solutions = useMemo(() => {
        const first = prodgrp3List[0];
        if (!first) return [];
        return [...(items[first] ?? [])].sort(
            (a, b) => Number(a.solutionid) - Number(b.solutionid),
        );
    }, [items, prodgrp3List]);

    if (isLoading) return <div className="p-4">Loading...</div>;
    if (isError)
        return <div className="p-4 text-destructive">Error loading data.</div>;

    return (
        <div className="flex flex-col gap-4 p-4">
            <div className="flex justify-end">
                <AddButton />
            </div>
            <div
                className={`border rounded-md overflow-auto max-h-[80vh] ${scrollbarClassName}`}
            >
                <Table>
                    <TableHeader className="sticky top-0 z-20">
                        <TableRow>
                            <TableHead className="sticky left-0 bg-secondary z-30 min-w-28">
                                ProdGrp3
                            </TableHead>
                            {solutions.map((sol) => (
                                <TableHead
                                    key={sol.solutionid}
                                    className="h-40 w-48 align-top pb-2"
                                    title={sol.solution}
                                >
                                    <div className="whitespace-pre-wrap">
                                        {sol.solution}
                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {prodgrp3List.map((grp) => {
                            const statusMap = Object.fromEntries(
                                (items[grp] ?? []).map((s) => [
                                    s.solutionid,
                                    s.status,
                                ]),
                            );
                            return (
                                <TableRow key={grp}>
                                    <TableCell className="sticky left-0 bg-background z-10 font-medium">
                                        {grp}
                                    </TableCell>
                                    {solutions.map((sol) => (
                                        <TableCell key={sol.solutionid}>
                                            {statusMap[sol.solutionid] ?? '—'}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

export default memo(LCBIPage);
