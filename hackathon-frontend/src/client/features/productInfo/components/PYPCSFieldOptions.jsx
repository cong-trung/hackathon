import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/shared/hooks/useAuth';
import {
    useDecideOptionMutation, useGetOptionReviewsQuery,
    useGetPypcsQuestionsQuery, useGetReviewSubmissionsQuery,
} from '@/app/api/pypcsOptionReviewApi';
import DataTable from '@/shared/components/data-table/data-table';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { fieldOptionsColumns } from './fieldOptionsColumns';

const statuses = ['pending', 'approved', 'mapped', 'rejected', 'all'];
const decisionSchema = z.object({
    mapped_to: z.string(),
    operation_description: z.string().max(200, 'Description must be at most 200 characters.'),
    note: z.string().max(500, 'Note must be at most 500 characters.'),
});

function reviewError(error) {
    const detail = error?.data?.detail;
    if (error?.status === 401) return 'Your session expired. Log in and try again.';
    if (error?.status === 403) return detail?.message || 'Only TI and admin users can review field options.';
    if (Array.isArray(detail)) return detail.map((entry) => entry.msg).filter(Boolean).join('; ');
    if (typeof detail === 'string') return detail;
    if (typeof detail?.message === 'string') return detail.message;
    return error?.status === 422 ? 'Check the decision details and try again.' : 'Unable to complete the request. Please try again.';
}

export default function PYPCSFieldOptions({ modeSwitch }) {
    const { isAdmin, isTI } = useAuth();
    const [status, setStatus] = useState('pending');
    const [search, setSearch] = useState('');
    const [decision, setDecision] = useState(null);
    const [decisionError, setDecisionError] = useState('');
    const { data, isLoading, isFetching, error, refetch } = useGetOptionReviewsQuery(status, { skip: !isAdmin && !isTI });
    const { data: questions, isFetching: questionsLoading, error: questionsError } = useGetPypcsQuestionsQuery(undefined, { skip: decision?.action !== 'map' });
    const { data: submissions, error: submissionsError } = useGetReviewSubmissionsQuery(undefined, { skip: !isAdmin && !isTI });
    const [decide, { isLoading: saving }] = useDecideOptionMutation();
    const form = useForm({ resolver: zodResolver(decisionSchema), defaultValues: { mapped_to: '', operation_description: '', note: '' } });
    const question = questions?.items?.find((item) => item.question_id === decision?.item.question_id);
    const options = (decision?.item.question_id === 'operation'
        ? question?.options_by_module?.[decision.item.module_key] : question?.options) || [];
    const targets = options.filter((option) => option && option.toLowerCase() !== 'other');
    const submissionsById = Object.fromEntries((submissions?.items || []).map((item) => [item.submission_id, item]));
    const visible = (data?.items || []).filter((item) => [item.question_label, item.module_key, item.value, item.status]
        .some((value) => String(value || '').toLowerCase().includes(search.trim().toLowerCase())));

    function openDecision(item, action) {
        if (action === 'map' && item.final_submission_count > 0 && !isAdmin) return;
        form.reset({ mapped_to: '', operation_description: '', note: '' });
        setDecisionError('');
        setDecision({ item, action });
    }

    async function submit(values) {
        if (!decision) return;
        if (decision.action === 'map' && !values.mapped_to) {
            form.setError('mapped_to', { message: 'Select an existing option.' });
            return;
        }
        if (decision.action === 'map' && decision.item.final_submission_count > 0 && !values.note.trim()) {
            form.setError('note', { message: 'A note is required for final submissions.' });
            return;
        }
        if (decision.action === 'approve' && decision.item.question_id === 'operation') {
            if (!/^\d{1,20}$/.test(decision.item.value)) {
                setDecisionError('Operation codes must contain at most 20 digits. You can reject or map this value instead.');
                return;
            }
            if (!values.operation_description.trim() || /[\r\n]/.test(values.operation_description)) {
                form.setError('operation_description', { message: 'Enter a single-line description.' });
                return;
            }
        }
        try {
            await decide({
                question_id: decision.item.question_id,
                value: decision.item.value,
                action: decision.action,
                ...(decision.item.module_key ? { module_key: decision.item.module_key } : {}),
                ...(decision.action === 'map' ? { mapped_to: values.mapped_to } : {}),
                ...(decision.action === 'approve' && decision.item.question_id === 'operation'
                    ? { operation_description: values.operation_description.trim() } : {}),
                ...(values.note.trim() ? { note: values.note.trim() } : {}),
            }).unwrap();
            toast.success(`Field option ${{ map: 'mapped', approve: 'approved', reject: 'rejected' }[decision.action]}.`);
            setDecision(null);
            refetch();
        } catch (requestError) {
            setDecisionError(reviewError(requestError));
        }
    }

    const columns = fieldOptionsColumns({ submissionsById, onAction: openDecision, isAdmin });
    const mapLoading = decision?.action === 'map' && questionsLoading;
    return (
        <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4" aria-label="Field options review">
            <div className="flex flex-wrap items-center gap-3">
                {modeSwitch}
                <h2 className="text-lg font-semibold">Field options</h2>
            </div>
            <div className="flex flex-wrap gap-3">
                <div className="w-44">
                    <label className="mb-1 block text-sm font-medium" htmlFor="option-review-status">Status</label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger id="option-review-status"><SelectValue /></SelectTrigger>
                        <SelectContent>{statuses.map((value) => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="min-w-44 flex-1 sm:max-w-xs">
                    <label className="mb-1 block text-sm font-medium" htmlFor="option-review-search">Search field options</label>
                    <Input id="option-review-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search field, module, value" />
                </div>
            </div>
            {error ? <div role="alert" className="text-sm text-destructive">{reviewError(error)} <Button variant="outline" size="sm" onClick={refetch}>Retry</Button></div> : null}
            {submissionsError ? <p role="alert" className="text-sm text-destructive">Product names could not be loaded; submission IDs are shown instead.</p> : null}
            {isLoading ? <p role="status">Loading field options…</p> : !error ? (
                <div className="min-h-0" aria-busy={isFetching}>
                    {!visible.length ? <p className="mb-2 text-sm text-muted-foreground">No field options match this filter.</p> : null}
                    <DataTable columns={columns} data={visible} paginationPageSize={25} paginationArray={[25, 50, 100]} />
                </div>
            ) : null}
            <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!open && !saving) setDecision(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{decision?.action === 'map' ? 'Map to existing option' : decision?.action === 'reject' ? 'Reject field option' : 'Approve field option'}</DialogTitle>
                        <DialogDescription>
                            {decision?.item.question_label}: {decision?.item.value}
                            {decision?.action === 'map' ? ' — matching answers will be updated in submissions.' : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form id="option-decision-form" onSubmit={form.handleSubmit(submit)} className="space-y-4">
                            {decision?.action === 'map' && (
                                <FormField control={form.control} name="mapped_to" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Existing option</FormLabel>
                                        <Select value={field.value} onValueChange={field.onChange} disabled={mapLoading || !targets.length || saving}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger></FormControl>
                                            <SelectContent>{targets.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            )}
                            {decision?.action === 'approve' && decision.item.question_id === 'operation' && (
                                <FormField control={form.control} name="operation_description" render={({ field }) => (
                                    <FormItem><FormLabel>Operation description</FormLabel><FormControl><Input maxLength={200} {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                            )}
                            {decision?.action !== 'approve' && (
                                <FormField control={form.control} name="note" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Note {decision?.action === 'map' && decision.item.final_submission_count > 0 ? '(required)' : '(optional)'}</FormLabel>
                                        <FormControl><Textarea maxLength={500} {...field} /></FormControl><FormMessage />
                                    </FormItem>
                                )} />
                            )}
                            {decision?.action === 'reject' && <p className="text-sm text-muted-foreground">Reject this value? Existing submissions will not be changed.</p>}
                            {questionsError && decision?.action === 'map' && <p role="alert" className="text-sm text-destructive">Could not load existing options. {reviewError(questionsError)}</p>}
                            {decision?.action === 'map' && !mapLoading && !questionsError && !targets.length && <p role="status" className="text-sm text-muted-foreground">No existing options are available for this field and module.</p>}
                            {decisionError && <p role="alert" className="text-sm text-destructive">{decisionError}</p>}
                        </form>
                    </Form>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={saving} onClick={() => setDecision(null)}>Cancel</Button>
                        <Button type="submit" form="option-decision-form" disabled={saving || mapLoading || (decision?.action === 'map' && (!targets.length || !!questionsError))}>
                            {saving ? 'Saving…' : decision?.action === 'map' ? 'Map value' : decision?.action === 'reject' ? 'Reject value' : 'Approve value'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}