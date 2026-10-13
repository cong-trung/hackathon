import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { useUpdateProductActionMatrixRowMutation } from '@/app/api/productActionMatrixApi';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { scrollbarClassName } from '@/shared/utils/scrollbar';

const schema = z.object({
    updated_by: z.string().trim().min(1, 'Updated by is required.'),
    cells: z.array(z.object({
        status: z.enum(['', 'Y', 'N', 'NA']),
        comment: z.string().trim().max(2000, 'Max 2000 characters.'),
    })),
});

function savedCell(row, action) {
    const cell = row.cells?.[action.nbr];
    return { status: cell?.status ?? '', comment: cell?.comment ?? '' };
}

function isChanged(row, action, cell) {
    const saved = savedCell(row, action);
    return cell?.status !== saved.status || cell?.comment?.trim() !== saved.comment;
}

function shouldSend(row, action, cell, mode) {
    return isChanged(row, action, cell) || (mode === 'final' && row.cells?.[action.nbr]?.decision_state === 'draft');
}

function mapError(error, form, sentIndices) {
    const detail = error?.data?.detail;
    const entries = Array.isArray(detail)
        ? detail.map(({ loc, msg }) => ({
            field: loc?.filter((part) => part !== 'body').reduce((path, part) =>
                typeof part === 'number' ? `${path}[${part}]` : path ? `${path}.${part}` : part, ''),
            message: msg,
        }))
        : detail?.field ? [detail] : [];
    let mapped = false;
    let firstField;
    entries.forEach(({ field, message }) => {
        const match = /^cells\[(\d+)\]\.(status|comment|action_nbr)$/.exec(field);
        if (match && sentIndices[Number(match[1])] !== undefined) {
            const index = sentIndices[Number(match[1])];
            const name = `cells.${index}.${match[2] === 'action_nbr' ? 'status' : match[2]}`;
            form.setError(name, {
                type: 'server', message: String(message),
            });
            firstField ??= name;
            mapped = true;
        } else if (field === 'updated_by') {
            form.setError('updated_by', { type: 'server', message: String(message) });
            firstField ??= 'updated_by';
            mapped = true;
        }
    });
    if (firstField) form.setFocus(firstField);
    if (!mapped) toast.error(entries[0]?.message ?? (typeof detail === 'string' ? detail : 'Could not save the row.'));
}

function ActionEditor({ action, index, cell, form, focusRef, focused }) {
    const suggestion = cell?.status ? '' : cell?.suggested_status;
    return (
        <div className="grid gap-3 border-b py-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">
                    {action.event_id || `#${action.nbr}`}
                    {cell?.decision_state === 'draft' && <Badge variant="outline" className="ml-2 text-[10px]">Draft</Badge>}
                </p>
                <p className="mt-1 line-clamp-3 text-sm" title={action.actionable_item}>{action.actionable_item}</p>
                {suggestion && (
                    <div className="mt-2 text-xs text-muted-foreground">
                        Suggested: {suggestion} — {cell.suggested_comment}{' '}
                        <Button type="button" variant="link" className="h-auto px-1 py-0 text-xs" onClick={() => {
                            form.setValue(`cells.${index}.status`, suggestion, { shouldDirty: true, shouldValidate: true });
                            form.setValue(`cells.${index}.comment`, cell.suggested_comment, { shouldDirty: true, shouldValidate: true });
                        }}>Use</Button>
                    </div>
                )}
            </div>
            <FormField control={form.control} name={`cells.${index}.status`} render={({ field }) => (
                <FormItem>
                    <FormLabel className="sr-only">{action.event_id || `#${action.nbr}`} status</FormLabel>
                    <Select value={field.value || '__blank__'} onValueChange={(value) => {
                        field.onChange(value === '__blank__' ? '' : value);
                        if (value === '__blank__') form.setValue(`cells.${index}.comment`, '', { shouldDirty: true, shouldValidate: true });
                    }}>
                        <FormControl><SelectTrigger ref={focused ? focusRef : undefined}><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value="__blank__">— Not reviewed</SelectItem>
                            <SelectItem value="Y">Y</SelectItem>
                            <SelectItem value="N">N</SelectItem>
                            <SelectItem value="NA">NA</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name={`cells.${index}.comment`} render={({ field }) => (
                <FormItem className="sm:col-span-2">
                    <FormLabel className="sr-only">{action.event_id || `#${action.nbr}`} comment</FormLabel>
                    <FormControl><Textarea rows={2} maxLength={2000} placeholder="Comment when reviewed" {...field} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
    );
}

export default function RowEditor({ row, actions, focusedAction, onClose, onReload }) {
    const focusRef = useRef(null);
    const cancelRef = useRef(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [conflict, setConflict] = useState(null);
    const [reloading, setReloading] = useState(false);
    const [loadedRow, setLoadedRow] = useState(row);
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            updated_by: localStorage.getItem('view3.updatedBy') ?? '',
            cells: actions.map((action) => savedCell(loadedRow, action)),
        },
    });
    const { isDirty } = form.formState;
    const cells = useWatch({ control: form.control, name: 'cells' });
    const [updateRow, { isLoading: saving }] = useUpdateProductActionMatrixRowMutation();
    const changed = actions.some((action, index) => isChanged(loadedRow, action, cells?.[index]));
    const hasDrafts = actions.some((action) => loadedRow.cells?.[action.nbr]?.decision_state === 'draft');

    function requestClose() {
        if (saving || reloading) return;
        if (isDirty) setConfirmDiscard(true);
        else onClose();
    }

    async function reloadLatest() {
        setReloading(true);
        try {
            const latest = await onReload();
            setLoadedRow(latest);
            form.reset({
                updated_by: localStorage.getItem('view3.updatedBy') ?? '',
                cells: actions.map((action) => savedCell(latest, action)),
            });
            setConflict(null);
        } catch {
            toast.error('Could not reload the row. Please try again.');
        } finally {
            setReloading(false);
        }
    }

    function acceptSuggestions() {
        actions.forEach((action, index) => {
            const cell = loadedRow.cells?.[action.nbr];
            if (!cell?.status && !cells?.[index]?.status && cell?.suggested_status) {
                form.setValue(`cells.${index}.status`, cell.suggested_status, { shouldDirty: true, shouldValidate: true });
                form.setValue(`cells.${index}.comment`, cell.suggested_comment, { shouldDirty: true, shouldValidate: true });
            }
        });
    }

    function onInvalid(errors) {
        if (errors.updated_by) form.setFocus('updated_by');
        else {
            const index = errors.cells?.findIndex((cell) => cell?.status || cell?.comment);
            if (index >= 0) form.setFocus(`cells.${index}.${errors.cells[index].status ? 'status' : 'comment'}`);
        }
    }

    function handleSave(mode) {
        void form.handleSubmit((values) => onSubmit(values, mode), onInvalid)();
    }

    async function onSubmit(values, mode) {
        if (mode === 'final') {
            const result = schema.superRefine((data, context) => {
                actions.forEach((action, index) => {
                    const cell = data.cells[index];
                    if (cell && shouldSend(loadedRow, action, cell, 'final') && cell.status && !cell.comment) {
                        context.addIssue({ code: 'custom', path: ['cells', index, 'comment'], message: 'Comment is required for a decision.' });
                    }
                });
            }).safeParse(values);
            if (!result.success) {
                result.error.issues.forEach((issue) => form.setError(issue.path.join('.'), { type: 'manual', message: issue.message }));
                form.setFocus(result.error.issues[0].path.join('.'));
                return;
            }
        }
        const sentIndices = [];
        const changes = actions.flatMap((action, index) => {
            const cell = values.cells[index];
            if (!shouldSend(loadedRow, action, cell, mode)) return [];
            sentIndices.push(index);
            const version = loadedRow.cells?.[action.nbr]?.version;
            return [{ action_nbr: action.nbr, status: cell.status, comment: cell.comment,
                ...(version ? { expected_version: version } : {}) }];
        });
        if (!changes.length) return;
        try {
            await updateRow({
                product_key: loadedRow.product_key,
                module_group: loadedRow.module_group,
                updated_by: values.updated_by,
                mode,
                cells: changes,
            }).unwrap();
            localStorage.setItem('view3.updatedBy', values.updated_by);
            toast.success(mode === 'draft' ? 'Draft saved.' : 'Saved.');
            onClose();
        } catch (error) {
            if (error?.status === 409 && error.data?.detail?.code === 'conflict') {
                setConflict(error.data.detail);
            } else {
                mapError(error, form, sentIndices);
            }
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && requestClose()}>
            <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden p-0"
                onInteractOutside={(event) => { if (confirmDiscard) event.preventDefault(); }}
                onEscapeKeyDown={(event) => { if (confirmDiscard) event.preventDefault(); }}
                onOpenAutoFocus={(event) => {
                    if (focusedAction !== null) {
                        event.preventDefault();
                        focusRef.current?.focus();
                    }
                }}>
                <DialogHeader className="px-6 pt-6 pr-12">
                    <DialogTitle>{loadedRow.product_name} · {loadedRow.module_group}</DialogTitle>
                    <DialogDescription>Review actions for this product.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={(event) => { event.preventDefault(); handleSave('final'); }} className="flex min-h-0 flex-col">
                        {conflict && (
                            <div role="alert" className="mx-6 rounded border border-destructive/30 p-3 text-sm text-destructive">
                                <p>{conflict.message}</p>
                                {conflict.conflicts?.length > 0 && (
                                    <ul className="mt-1 list-disc pl-5">
                                        {conflict.conflicts.map(({ action_nbr, current }) => {
                                            const action = actions.find((entry) => entry.nbr === action_nbr);
                                            return (
                                                <li key={action_nbr}>
                                                    {action?.event_id || `#${action_nbr}`}: changed by {current?.updated_by || 'unknown'}
                                                    {current?.updated_at && ` at ${new Date(current.updated_at).toLocaleString()}`}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                                <Button type="button" variant="outline" className="mt-2" onClick={reloadLatest} disabled={reloading}>
                                    {reloading ? 'Reloading...' : 'Reload latest'}
                                </Button>
                            </div>
                        )}
                        <div className={`min-h-0 overflow-y-auto px-6 ${scrollbarClassName}`}>
                            <FormField control={form.control} name="updated_by" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Updated by *</FormLabel>
                                    <FormControl><Input autoComplete="name" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <Button type="button" variant="outline" className="mt-4" onClick={acceptSuggestions}>
                                Accept all suggestions
                            </Button>
                            {actions.map((action, index) => (
                                <ActionEditor key={action.nbr} action={action} index={index}
                                    cell={loadedRow.cells?.[action.nbr]} form={form} focusRef={focusRef}
                                    focused={action.nbr === focusedAction} />
                            ))}
                        </div>
                        <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4">
                            <Button ref={cancelRef} type="button" variant="outline" onClick={requestClose} disabled={saving}>Cancel</Button>
                            <Button type="button" variant="outline" onClick={() => handleSave('draft')} disabled={saving || reloading || Boolean(conflict) || !changed}>
                                Save draft
                            </Button>
                            <Button type="submit" disabled={saving || reloading || Boolean(conflict) || (!changed && !hasDrafts)}>
                                Save
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
            <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <AlertDialogContent onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    cancelRef.current?.focus();
                }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                        <AlertDialogDescription>Your changes will be lost.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep editing</AlertDialogCancel>
                        <AlertDialogAction onClick={onClose}>Discard</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}