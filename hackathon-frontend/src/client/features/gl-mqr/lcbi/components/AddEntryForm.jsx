import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';

const schema = z.object({
    module: z.string().min(1, 'Module is required'),
    solution: z.string().min(1, 'Solution is required'),
    key_summary: z.string().min(1, 'Key Summary is required'),
    excursion_related: z.string().min(1, 'Excursion Related is required'),
});

const fields = [
    { name: 'module', label: 'Module' },
    { name: 'solution', label: 'Solution', textarea: true },
    { name: 'key_summary', label: 'Key Summary', textarea: true },
    { name: 'excursion_related', label: 'Excursion Related' },
];

function AddEntryForm({ onSubmit, onCancel }) {
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: Object.fromEntries(fields.map((f) => [f.name, ''])),
    });

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    {fields.map(({ name, label, textarea }) => (
                        <FormField
                            key={name}
                            control={form.control}
                            name={name}
                            render={({ field }) => (
                                <FormItem
                                    className={textarea ? 'col-span-2' : ''}
                                >
                                    <FormLabel>{label}</FormLabel>
                                    <FormControl>
                                        {textarea ? (
                                            <Textarea
                                                placeholder={label}
                                                {...field}
                                            />
                                        ) : (
                                            <Input
                                                placeholder={label}
                                                {...field}
                                            />
                                        )}
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit">Save</Button>
                </div>
            </form>
        </Form>
    );
}

export default AddEntryForm;
