import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/shared/components/ui/form';
import { Button } from '@/shared/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { scrollbarClassName } from '@/shared/utils/scrollbar';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/shared/components/ui/table';
import { useGetSolutionsQuery } from '@/app/api/solutionApi';
import { useUpdatePdSolutionMutation } from '@/app/api/pdSolutionApi';
import { useGetSTHIQuery } from '@/app/api/pdoApi';

const STATUS_OPTIONS = ['Y', 'N-reviewed', 'N/A', 'On hold'];

function AddEntryForm({ onSubmit, onCancel }) {
    const { data: solutionData } = useGetSolutionsQuery('sthi');
    const solutions = solutionData?.items ?? [];
    const [updatePdSolution] = useUpdatePdSolutionMutation();

    const { data: sthiData } = useGetSTHIQuery();
    const prodgroup3Options = useMemo(() => {
        const items = sthiData?.items ?? [];
        const seen = new Set();
        return items
            .filter(
                (r) =>
                    r.prodgroup3 &&
                    !seen.has(r.prodgroup3) &&
                    seen.add(r.prodgroup3),
            )
            .map((r) => ({ id: r.prodgroup3, name: r.prodgroup3 }));
    }, [sthiData]);

    const form = useForm({ defaultValues: { prodgroup3: '' } });
    const [solutionStatuses, setSolutionStatuses] = useState({});
    const [solutionComments, setSolutionComments] = useState({});

    const prodgroup3 = form.watch('prodgroup3');

    const isSaveDisabled = useMemo(() => {
        if (!prodgroup3) return true;
        for (const sol of solutions) {
            const status = solutionStatuses[sol.id];
            const comment = solutionComments[sol.id];
            if (
                (status === 'N-reviewed' || status === 'On hold') &&
                !comment?.trim()
            ) {
                return true;
            }
        }
        return false;
    }, [prodgroup3, solutionStatuses, solutionComments, solutions]);

    const handleSubmit = (data) => {
        const pdid = data.prodgroup3;
        const solutionList = solutions.map((sol) => ({
            solutionid: sol.id,
            status: solutionStatuses[sol.id] ?? 'N/A',
            comment: solutionComments[sol.id] ?? '',
        }));
        updatePdSolution({
            module: 'sthi',
            data: solutionList.map(({ solutionid, status, comment }) => ({
                pdid,
                solutionid,
                status,
                note: comment,
            })),
        });
        onSubmit(data);
    };

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4"
            >
                <FormField
                    control={form.control}
                    name="prodgroup3"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>ProdGroup3</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select ProdGroup3" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-[50vh]">
                                    {prodgroup3Options.map((opt) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            {opt.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div
                    className={`border rounded-md overflow-auto max-h-96 ${scrollbarClassName} flex-none`}
                >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-40">Solution</TableHead>
                                <TableHead className="w-40">Status</TableHead>
                                <TableHead>Comment</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {solutions.map((sol) => {
                                const status =
                                    solutionStatuses[sol.id] ?? 'N/A';
                                const isCommentRequired =
                                    status === 'N-reviewed' ||
                                    status === 'On hold';
                                return (
                                    <TableRow key={sol.id}>
                                        <TableCell>{sol.solution}</TableCell>
                                        <TableCell>
                                            <Select
                                                value={status}
                                                onValueChange={(val) =>
                                                    setSolutionStatuses(
                                                        (prev) => ({
                                                            ...prev,
                                                            [sol.id]: val,
                                                        }),
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="w-36">
                                                    <SelectValue placeholder="Select" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {STATUS_OPTIONS.map(
                                                        (opt) => (
                                                            <SelectItem
                                                                key={opt}
                                                                value={opt}
                                                            >
                                                                {opt}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <Textarea
                                                value={
                                                    solutionComments[sol.id] ??
                                                    ''
                                                }
                                                onChange={(e) =>
                                                    setSolutionComments(
                                                        (prev) => ({
                                                            ...prev,
                                                            [sol.id]:
                                                                e.target.value,
                                                        }),
                                                    )
                                                }
                                                disabled={!isCommentRequired}
                                                placeholder={
                                                    isCommentRequired
                                                        ? 'Comment required'
                                                        : ''
                                                }
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSaveDisabled}>
                        Save
                    </Button>
                </div>
            </form>
        </Form>
    );
}

export default AddEntryForm;
