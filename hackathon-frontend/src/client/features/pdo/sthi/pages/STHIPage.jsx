import { memo, useMemo, useState } from 'react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/components/ui/select';
import { scrollbarClassName } from '@/shared/utils/scrollbar';
import AddButton from '../components/AddButton';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/shared/components/ui/popover';
import { useGetPdSolutionQuery } from '@/app/api/pdSolutionApi';

function statusColor(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s === 'n-reviewed') return 'bg-blue-100 text-blue-800';
    if (s === 'n/a' || s === 'y') return 'bg-green-100 text-green-800';
    if (s === 'on hold') return 'bg-yellow-100 text-yellow-800';
    return '';
}

function STHIPage() {
    const {
        data: pdSolutionData,
        isLoading,
        isError,
    } = useGetPdSolutionQuery('sthi');

    const [filterGrp, setFilterGrp] = useState('all');

    const items = pdSolutionData?.items ?? {};
    const prodgrp3List = Object.keys(items);
    const filteredList =
        filterGrp === 'all'
            ? prodgrp3List
            : prodgrp3List.filter((g) => g === filterGrp);

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
            <div className="flex justify-between items-center">
                <Select value={filterGrp} onValueChange={setFilterGrp}>
                    <SelectTrigger className="w-64">
                        <SelectValue placeholder="Filter ProdGrp3" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {prodgrp3List.map((g) => (
                            <SelectItem key={g} value={g}>
                                {g}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
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
                        {filteredList.map((grp) => {
                            const statusMap = Object.fromEntries(
                                (items[grp] ?? []).map((s) => [
                                    s.solutionid,
                                    s.status,
                                ]),
                            );
                            const noteMap = Object.fromEntries(
                                (items[grp] ?? [])
                                    .filter((s) => s.note)
                                    .map((s) => [s.solutionid, s.note]),
                            );
                            return (
                                <TableRow key={grp}>
                                    <TableCell className="sticky left-0 bg-background z-10 font-medium">
                                        {grp}
                                    </TableCell>
                                    {solutions.map((sol) => {
                                        const st = statusMap[sol.solutionid];
                                        return (
                                            <TableCell
                                                key={sol.solutionid}
                                                className={statusColor(st)}
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span>{st ?? '—'}</span>
                                                    {noteMap[
                                                        sol.solutionid
                                                    ] && (
                                                        <Popover>
                                                            <PopoverTrigger
                                                                asChild
                                                            >
                                                                <button className="inline-flex items-center justify-center size-4 rounded-full bg-muted text-muted-foreground text-[10px] font-bold leading-none hover:bg-accent cursor-pointer">
                                                                    ?
                                                                </button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-64 text-sm">
                                                                {
                                                                    noteMap[
                                                                        sol
                                                                            .solutionid
                                                                    ]
                                                                }
                                                            </PopoverContent>
                                                        </Popover>
                                                    )}
                                                </div>
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

export default memo(STHIPage);
