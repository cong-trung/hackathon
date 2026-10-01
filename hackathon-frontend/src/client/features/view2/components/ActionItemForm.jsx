import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronsUpDownIcon } from 'lucide-react';

import {
    useCreateActionItemMutation,
    useGetActionItemOptionsQuery,
    useUpdateActionItemMutation,
} from '@/app/api/pypcsActionItemsApi';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/shared/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/shared/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/shared/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';

const applicabilityFields = [
    { name: 'package', label: 'Package' },
    { name: 'bare_die_lid', label: 'Bare die / Lid' },
    { name: 'foveros', label: 'Foveros' },
    { name: 'segment', label: 'Segment' },
    { name: 'xvi_tool_type', label: 'xVI tool type' },
    { name: 'lts_ball', label: 'LTS ball' },
    { name: 'hdmx_ap_pan', label: 'HDMx AP Pan' },
];

const requiredText = (label) =>
    z.string().trim().min(1, `${label} is required.`);

const customText = (emptyMessage) =>
    z.string().trim()
        .min(1, emptyMessage)
        .max(100, 'Max 100 characters.')
        .refine((value) => !value.includes('|'), 'Cannot contain |.')
        .refine((value) => !/^(all|na|multiple|other)$/i.test(value), 'This value is reserved.');

const schema = (options) => z
    .object({
        actionable_item: requiredText('Actionable item'),
        reference: requiredText('Reference'),
        description: z.string(),
        ar_follow_up: z.string(),
        package: z.array(z.string()),
        bare_die_lid: z.array(z.string()),
        foveros: z.array(z.string()),
        segment: z.array(z.string()),
        xvi_tool_type: z.array(z.string()),
        xvi_tool_comment: z.string(),
        lts_ball: z.array(z.string()),
        hdmx_ap_pan: z.array(z.string()),
        owner: requiredText('Owner'),
        owner_other: z.string(),
        update_by: requiredText('Update by'),
        scenario: z.string(),
        ...Object.fromEntries(applicabilityFields.map(({ name }) => [`${name}_other`, z.string()])),
    })
    .superRefine((values, context) => {
        if (values.owner === 'Other') {
            const result = customText('Please specify the owner.').safeParse(values.owner_other);
            if (!result.success) {
                context.addIssue({ code: 'custom', path: ['owner_other'], message: result.error.issues[0].message });
            }
        }
        applicabilityFields.forEach(({ name }) => {
            if (options?.fields?.[name]?.includes('Other') && values[name].includes('Other')) {
                const result = customText('Please specify the Other value.').safeParse(values[`${name}_other`]);
                if (!result.success) {
                    context.addIssue({ code: 'custom', path: [`${name}_other`], message: result.error.issues[0].message });
                }
            }
        });
        if (
            values.xvi_tool_type.includes('Multiple') &&
            !values.xvi_tool_comment.trim()
        ) {
            context.addIssue({
                code: 'custom',
                path: ['xvi_tool_comment'],
                message: 'Explain the multiple tools.',
            });
        }
    });

const textFields = [
    { name: 'actionable_item', label: 'Actionable item' },
    { name: 'reference', label: 'Reference', multiline: true },
    { name: 'description', label: 'Description', multiline: true },
    { name: 'ar_follow_up', label: 'AR follow up', multiline: true },
];

function defaults(item, options) {
    return {
        actionable_item: item?.actionable_item ?? '',
        reference: item?.reference ?? '',
        description: item?.description ?? '',
        ar_follow_up: item?.ar_follow_up ?? '',
        ...Object.fromEntries(
            applicabilityFields.flatMap(({ name }) => {
                const values = item?.[name] ?? [];
                const known = options?.fields?.[name] ?? [];
                const unknown = values.filter((value) => value && !known.includes(value));
                return [
                    [name, [...values.filter((value) => known.includes(value)), ...(unknown.length && known.includes('Other') ? ['Other'] : [])]],
                    [`${name}_other`, unknown[0] ?? ''],
                ];
            }),
        ),
        xvi_tool_comment: item?.xvi_tool_comment ?? '',
        owner: item?.owner && options?.owner?.includes(item.owner) ? item.owner : item?.owner ? 'Other' : '',
        owner_other: item?.owner && !options?.owner?.includes(item.owner) ? item.owner : '',
        update_by: item?.update_by ?? '',
        scenario: item?.scenario ?? '',
    };
}

function applyServerErrors(error, form) {
    const detail = error?.data?.detail;
    const entries = Array.isArray(detail)
        ? detail.map(({ loc, msg }) => ({ field: loc?.at(-1), message: msg }))
        : detail?.field
          ? [detail]
          : [];
    let mapped = false;

    entries.forEach(({ field, message }) => {
        if (field && Object.hasOwn(form.getValues(), field)) {
            form.setError(field, { type: 'server', message: String(message) });
            mapped = true;
        }
    });

    if (!mapped) {
        toast.error(
            typeof detail === 'string'
                ? detail
                : 'Could not save the action item. Please try again.',
        );
    }
}

function ApplicabilityField({ control, setValue, name, label, options }) {
    const selected = useWatch({ control, name });
    return (
        <div className="min-w-0 space-y-2">
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem className="min-w-0">
                    <FormLabel>{label}</FormLabel>
                    <Popover modal>
                        <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    aria-label={label}
                                    className="w-full justify-between font-normal"
                                >
                                    <span className="truncate">
                                        {field.value.length
                                            ? field.value.join(', ')
                                            : 'Select values'}
                                    </span>
                                    <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                                </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                                <CommandInput placeholder={`Search ${label}`} />
                                <CommandList>
                                    <CommandEmpty>No options found.</CommandEmpty>
                                    <CommandGroup>
                                        {options.map(
                                            (option) => (
                                                <CommandItem
                                                    key={option}
                                                    value={option}
                                                    onSelect={() => {
                                                        const selected = field.value.includes(option);
                                                        if (option === 'All' || (option === 'Other' && selected)) {
                                                            setValue(`${name}_other`, '', { shouldValidate: true });
                                                        }
                                                        field.onChange(
                                                            selected
                                                                ? field.value.filter((value) => value !== option)
                                                                : option === 'All'
                                                                  ? ['All']
                                                                  : [...field.value.filter((value) => value !== 'All'), option],
                                                        );
                                                    }}
                                                >
                                                    <Checkbox
                                                        checked={field.value.includes(option)}
                                                        tabIndex={-1}
                                                        className="pointer-events-none mr-2"
                                                    />
                                                    {option}
                                                </CommandItem>
                                            ),
                                        )}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <FormMessage />
                </FormItem>
            )}
        />
        {options.includes('Other') && selected?.includes('Other') && (
            <FormField
                control={control}
                name={`${name}_other`}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="sr-only">Please specify {label}</FormLabel>
                        <FormControl><Input placeholder={`Please specify ${label}`} {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        )}
        </div>
    );
}

export default function ActionItemForm({ item, onClose }) {
    const { data: options, isLoading, isError, refetch } =
        useGetActionItemOptionsQuery();
    const form = useForm({
        resolver: zodResolver(schema(options)),
        defaultValues: defaults(item, options),
    });
    const { reset, formState: { isDirty } } = form;
    useEffect(() => {
        if (options && !isDirty) {
            reset(defaults(item, options));
        }
    }, [options, item, reset, isDirty]);
    const selectedTools = useWatch({ control: form.control, name: 'xvi_tool_type' });
    const selectedOwner = useWatch({ control: form.control, name: 'owner' });
    const [createItem, { isLoading: isCreating }] = useCreateActionItemMutation();
    const [updateItem, { isLoading: isUpdating }] = useUpdateActionItemMutation();
    const saving = isCreating || isUpdating;

    async function onSubmit(values) {
        const { owner_other, ...fields } = values;
        const payload = {
            ...fields,
            owner: values.owner === 'Other' ? owner_other.trim() : values.owner,
            ...Object.fromEntries(
                applicabilityFields.map(({ name }) => [
                    name,
                    values[name].includes('All')
                        ? ['All']
                        : [...values[name].filter((value) => value !== 'Other'), ...(values[name].includes('Other') ? [values[`${name}_other`].trim()] : [])],
                ]),
            ),
        };
        applicabilityFields.forEach(({ name }) => delete payload[`${name}_other`]);

        try {
            if (item) {
                await updateItem({ nbr: item.nbr, body: payload }).unwrap();
            } else {
                await createItem(payload).unwrap();
            }
            toast.success(item ? 'Action item updated.' : 'Action item added.');
            onClose();
        } catch (error) {
            applyServerErrors(error, form);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden p-0">
                <DialogHeader className="px-6 pt-6 pr-12">
                    <DialogTitle>
                        {item ? `Edit item NBr# ${item.nbr}` : 'Add new item'}
                    </DialogTitle>
                    <DialogDescription>
                        Fields marked * are required. All replaces other applicability selections.
                    </DialogDescription>
                </DialogHeader>
                {isError ? (
                    <div role="alert" className="px-6 pb-6 text-sm text-destructive">
                        Could not load field options.{' '}
                        <Button type="button" variant="outline" onClick={refetch}>
                            Retry
                        </Button>
                    </div>
                ) : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
                            <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto px-6 py-2 sm:grid-cols-2">
                                {textFields.map(({ name, label, multiline }) => (
                                    <FormField
                                        key={name}
                                        control={form.control}
                                        name={name}
                                        render={({ field }) => (
                                            <FormItem className={multiline ? 'sm:col-span-2' : ''}>
                                                <FormLabel>{label}{['actionable_item', 'reference'].includes(name) && ' *'}</FormLabel>
                                                <FormControl>
                                                    {multiline ? (
                                                        <Textarea rows={2} {...field} />
                                                    ) : (
                                                        <Input {...field} />
                                                    )}
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ))}
                                <div className="sm:col-span-2 border-t pt-4 text-sm font-medium">
                                    Applicability (Quality Matrix questions)
                                </div>
                                {applicabilityFields.map(({ name, label }) => (
                                    <ApplicabilityField
                                        key={name}
                                        control={form.control}
                                        setValue={form.setValue}
                                        name={name}
                                        label={label}
                                        options={options?.fields?.[name] ?? []}
                                    />
                                ))}
                                {selectedTools?.includes('Multiple') && (
                                    <FormField
                                        control={form.control}
                                        name="xvi_tool_comment"
                                        render={({ field }) => (
                                            <FormItem className="sm:col-span-2">
                                                <FormLabel>Multiple tools comment *</FormLabel>
                                                <FormControl><Textarea rows={2} {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                                <FormField
                                    control={form.control}
                                    name="owner"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Owner *</FormLabel>
                                            <Select onValueChange={(value) => {
                                                field.onChange(value);
                                                if (value !== 'Other') form.setValue('owner_other', '');
                                            }} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {(options?.owner ?? []).map((owner) => (
                                                        <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {selectedOwner === 'Other' && (
                                    <FormField
                                        control={form.control}
                                        name="owner_other"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="sr-only">Please specify owner</FormLabel>
                                                <FormControl><Input placeholder="Please specify owner" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                                <FormField
                                    control={form.control}
                                    name="update_by"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Update by *</FormLabel>
                                            <FormControl><Input {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="scenario"
                                    render={({ field }) => (
                                        <FormItem className="sm:col-span-2">
                                            <FormLabel>Scenario</FormLabel>
                                            <FormControl><Textarea rows={2} {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="flex justify-end gap-2 border-t px-6 py-4">
                                <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saving || isLoading || isError}>
                                    {saving ? 'Saving...' : item ? 'Save changes' : 'Add item'}
                                </Button>
                            </div>
                        </form>
                    </Form>
                )}
            </DialogContent>
        </Dialog>
    );
}