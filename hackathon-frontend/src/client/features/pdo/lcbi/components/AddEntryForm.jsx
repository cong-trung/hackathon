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
import { useGetLCBIQuery } from '@/app/api/pdoApi';

const STATUS_OPTIONS = ['Y', 'N-reviewed', 'N/A', 'On hold'];

function AddEntryForm({ onSubmit, onCancel }) {
    const { data: solutionData } = useGetSolutionsQuery('lcbi');
    const solutions = solutionData?.items ?? [];
    const [updatePdSolution] = useUpdatePdSolutionMutation();

    const { data: lcbiData } = useGetLCBIQuery();
    const prodgroup3Options = useMemo(() => {
        const items = lcbiData?.items ?? [];
        const seen = new Set();
        return items
            .filter(
                (r) =>
                    r.prodgroup3 &&
                    !seen.has(r.prodgroup3) &&
                    seen.add(r.prodgroup3),
            )
            .map((r) => ({ id: r.prodgroup3, name: r.prodgroup3 }));
    }, [lcbiData]);

    const form = useForm({ defaultValues: { prodgroup3: '' } });
    const [solutionStatuses, setSolutionStatuses] = useState({});

    const prodgroup3 = form.watch('prodgroup3');

    const handleSubmit = (data) => {
        const pdid = data.prodgroup3;
        const solutionList = solutions.map((sol) => ({
            solutionid: sol.id,
            status: solutionStatuses[sol.id] ?? 'N/A',
        }));
        updatePdSolution({
            module: 'lcbi',
            data: solutionList.map(({ solutionid, status }) => ({
                pdid,
                solutionid,
                status,
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
                                <TableHead>Solution</TableHead>
                                <TableHead className="w-40">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {solutions.map((sol) => (
                                <TableRow key={sol.id}>
                                    <TableCell>{sol.solution}</TableCell>
                                    <TableCell>
                                        <Select
                                            value={
                                                solutionStatuses[sol.id] ??
                                                'N/A'
                                            }
                                            onValueChange={(val) =>
                                                setSolutionStatuses((prev) => ({
                                                    ...prev,
                                                    [sol.id]: val,
                                                }))
                                            }
                                        >
                                            <SelectTrigger className="w-36">
                                                <SelectValue placeholder="Select" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {STATUS_OPTIONS.map((opt) => (
                                                    <SelectItem
                                                        key={opt}
                                                        value={opt}
                                                    >
                                                        {opt}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={!prodgroup3}>
                        Save
                    </Button>
                </div>
            </form>
        </Form>
    );
}

export default AddEntryForm;
