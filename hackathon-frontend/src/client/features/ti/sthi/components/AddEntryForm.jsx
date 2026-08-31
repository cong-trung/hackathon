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
import { Button } from '@/shared/components/ui/button';

const schema = z.object({
    product: z.string().min(1, 'Product is required'),
    prodgroup3: z.string().min(1, 'ProdGroup3 is required'),
    module: z.string().min(1, 'Module is required'),
    nsb: z.string().min(1, 'NSB is required'),
    mcp: z.string().min(1, 'MCP is required'),
    pkg: z.string().min(1, 'Package is required'),
    pkg_1: z.string().min(1, 'Package (1) is required'),
    prd_seg: z.string().min(1, 'Product Segment is required'),
    xvi_tool_type: z.string().min(1, 'xVI tool type is required'),
    fab_tech: z.string().min(1, 'Fab Technology is required'),
    thermal_tech: z.string().min(1, 'Thermal Technology is required'),
    sw_platform: z.string().min(1, 'SW platform is required'),
    lts_ball: z.string().min(1, 'LTS ball is required'),
    fusion_or_apse: z.string().min(1, 'Fusion or Apse is required'),
    socket_type: z.string().min(1, 'Socket Type is required'),
});

const fields = [
    { name: 'product', label: 'Product' },
    { name: 'prodgroup3', label: 'ProdGroup3' },
    { name: 'module', label: 'Module' },
    { name: 'nsb', label: 'NSB' },
    { name: 'mcp', label: 'MCP' },
    { name: 'pkg', label: 'Package' },
    { name: 'pkg_1', label: 'Package (1)' },
    { name: 'prd_seg', label: 'Product Segment' },
    { name: 'xvi_tool_type', label: 'xVI Tool Type' },
    { name: 'fab_tech', label: 'Fab Technology' },
    { name: 'thermal_tech', label: 'Thermal Technology' },
    { name: 'sw_platform', label: 'SW Platform' },
    { name: 'lts_ball', label: 'LTS Ball' },
    { name: 'fusion_or_apse', label: 'Fusion or Apse' },
    { name: 'socket_type', label: 'Socket Type' },
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
                    {fields.map(({ name, label }) => (
                        <FormField
                            key={name}
                            control={form.control}
                            name={name}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{label}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={label} {...field} />
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
