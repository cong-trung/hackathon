import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowDown, ArrowUp } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import store from '@/app/store';
import { apiSlice } from '@/app/api/apiSlice';
import { authErrorMessage, loginPath, useAuth } from '@/shared/hooks/useAuth';
import ClientPagination from '@/shared/components/data-table/ClientPagination';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/shared/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';

const API_BASE = '/api';

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    const text = await response.text();

    if (!response.ok) {
        if (response.status === 401 && options.method) {
            store.dispatch(apiSlice.util.invalidateTags(['Auth']));
        }
        const error = new Error(text || response.statusText);
        error.status = response.status;
        try { error.detail = JSON.parse(text)?.detail; } catch { error.detail = undefined; }
        throw error;
    }

    if (!text) {
        return {};
    }

    return JSON.parse(text);
}

function buildMatrixRows(detail) {
    const cells = detail?.cells || [];
    const rowsByQuestion = {};

    cells.forEach((cell) => {
        if (!rowsByQuestion[cell.question_id]) {
            rowsByQuestion[cell.question_id] = {
                question_id: cell.question_id,
                display_label: cell.display_label || cell.question_id,
                description: cell.description || '',
                role: cell.role || '',
                cells: {},
            };
        }

        rowsByQuestion[cell.question_id].cells[cell.module_key] = cell;
    });

    return Object.values(rowsByQuestion);
}

function displayAnswer(questionId, answer) {
    return questionId === 'operation' ? (answer || '').split('|').join(', ') : answer;
}

export default function PYPCSSubmissionsReview({
    onContinueEditing = () => {},
    modeSwitch,
} = {}) {
    const [submissions, setSubmissions] = useState([]);
    const [selectedDetail, setSelectedDetail] = useState(null);
    const detailTrigger = useRef(null);
    const refreshButton = useRef(null);
    const [listError, setListError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [statusKind, setStatusKind] = useState('success');
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const { isAuthenticated, isAdmin, isGuest } = useAuth();
    const location = useLocation();
    const [history, setHistory] = useState([]);
    const [historyError, setHistoryError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sort, setSort] = useState({ key: 'created_at', direction: 'descending' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const statuses = useMemo(() => [...new Set(submissions.map((item) => item.status).filter(Boolean))], [submissions]);
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return submissions.filter((item) =>
            (statusFilter === 'all' || item.status === statusFilter) &&
            (!term || [item.created_at, item.status, item.product_name, item.prodgroup3,
                displayAnswer('operation', item.operation), (item.selected_modules || []).join(', '),
                item.role, item.submitted_by].some((value) => String(value ?? '').toLowerCase().includes(term))));
    }, [submissions, search, statusFilter]);
    const sorted = useMemo(() => [...filtered].sort((first, second) => {
        const left = sort.key === 'created_at' ? Date.parse(first.created_at) || 0 : String(first[sort.key] ?? '');
        const right = sort.key === 'created_at' ? Date.parse(second.created_at) || 0 : String(second[sort.key] ?? '');
        const comparison = typeof left === 'number' ? left - right : left.localeCompare(right, undefined, { numeric: true });
        return sort.direction === 'ascending' ? comparison : -comparison;
    }), [filtered, sort]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(sorted.length / pageSize)));
    const visibleSubmissions = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    function changeSort(key) {
        setSort((previous) => ({ key, direction: previous.key === key && previous.direction === 'ascending' ? 'descending' : 'ascending' }));
        setPage(1);
    }

    function sortHeader(key, label) {
        const direction = sort.key === key ? sort.direction : 'none';
        const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowDownUp;
        return (
            <th scope="col" aria-sort={direction} className="sticky top-0 z-10 border-b border-r border-white/20 bg-table-header p-3 text-table-header-foreground">
                <button type="button" onClick={() => changeSort(key)}
                    className="inline-flex items-center gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    {label}<Icon aria-hidden="true" className="size-4 shrink-0" />
                </button>
            </th>
        );
    }

    const matrixRows = useMemo(() => {
        return buildMatrixRows(selectedDetail);
    }, [selectedDetail]);

    async function loadSubmissions() {
        setLoading(true);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/submissions');
            setSubmissions(result.items || []);
            setListError(false);
            return true;
        } catch (error) {
            setListError(true);
            setStatusKind('error');
            setStatusMessage(`Failed to load submissions: ${error.message}`);
            return false;
        } finally {
            setLoading(false);
        }
    }

    async function loadSubmissionDetail(submissionId) {
        setLoading(true);
        setStatusMessage('');

        try {
            const result = await requestJson(
                `/pypcs/submissions/${submissionId}`,
            );

            setSelectedDetail(result);
            setHistory([]);
            setHistoryError('');
            try {
                const entries = await requestJson(`/pypcs/submissions/${submissionId}/history`);
                setHistory(Array.isArray(entries) ? entries : entries.items || []);
            } catch {
                setHistoryError('Unable to load edit history.');
            }
        } catch (error) {
            detailTrigger.current = null;
            setStatusKind('error');
            setStatusMessage(
                `Failed to load submission detail: ${error.message}`,
            );
        } finally {
            setLoading(false);
        }
    }

    function requestDeleteSubmission(submissionId) {
        const submission = submissions.find((item) => item.submission_id === submissionId);
        if (!isAuthenticated || (submission?.status === 'final' && !isAdmin)) return;
        setPendingDeleteId(submissionId);
    }

    function cancelDeleteSubmission() {
        setPendingDeleteId(null);
    }

    async function confirmDeleteSubmission(submissionId) {
        setLoading(true);
        setStatusMessage('');

        try {
            await requestJson(`/pypcs/submissions/${submissionId}`, {
                method: 'DELETE',
            });

            if (selectedDetail?.submission?.submission_id === submissionId) {
                setSelectedDetail(null);
            }

            setPendingDeleteId(null);
            if (await loadSubmissions()) {
                setStatusKind('success');
                setStatusMessage('Submission deleted.');
            }
        } catch (error) {
            setStatusKind('error');
            setStatusMessage(error.status === 401 || error.status === 403
                ? authErrorMessage(error) : `Failed to delete submission: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadSubmissions();
    }, []);

    function renderDeleteControl(submissionId) {
        if (isGuest || !isAuthenticated || (!isAdmin && submissions.find((item) => item.submission_id === submissionId)?.status === 'final')) return null;
        if (pendingDeleteId === submissionId) {
            return (
                <div className="flex items-center gap-1">
                    <span className="text-xs text-destructive">Delete?</span>

                    <button
                        type="button"
                        className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-50"
                        onClick={() => confirmDeleteSubmission(submissionId)}
                        disabled={loading}
                    >
                        Yes
                    </button>

                    <button
                        type="button"
                        className="rounded-md border px-2 py-1 text-xs"
                        onClick={cancelDeleteSubmission}
                        disabled={loading}
                    >
                        No
                    </button>
                </div>
            );
        }

        return (
            <button
                type="button"
                className="rounded-md border border-destructive px-3 py-1 text-destructive disabled:opacity-50"
                onClick={() => requestDeleteSubmission(submissionId)}
                disabled={loading}
            >
                Delete
            </button>
        );
    }

    function renderMatrixDetail() {
        const selectedModules =
            selectedDetail?.submission?.selected_modules || [];

        if ((selectedDetail?.cells || []).length === 0) {
            return null;
        }

        return (
            <div className="mt-4 overflow-x-auto rounded-md border border-table-border">
                <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead className="bg-table-header text-left text-table-header-foreground">
                        <tr>
                            <th className="min-w-64 border-b border-r border-white/20 p-3">Question</th>
                            <th className="min-w-80 border-b border-r border-white/20 p-3">
                                Description
                            </th>
                            <th className="min-w-20 border-b border-r border-white/20 p-3">Role</th>

                            {selectedModules.map((moduleKey) => (
                                <th
                                    key={moduleKey}
                                    className="min-w-40 border-b border-r border-white/20 p-3 text-center"
                                >
                                    {moduleKey}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {matrixRows.map((row) => (
                            <tr key={row.question_id} className="even:bg-table-stripe hover:bg-table-hover">
                                <td className="border-b border-r border-table-border bg-primary p-3 font-medium text-primary-foreground">
                                    {row.display_label}
                                </td>

                                <td className="border-b border-r border-table-border bg-table-subheader p-3 text-xs text-table-subheader-foreground">
                                    {row.description}
                                </td>

                                <td className="border-b border-r border-table-border p-3 text-center font-medium">
                                    {row.role}
                                </td>

                                {selectedModules.map((moduleKey) => {
                                    const cell = row.cells[moduleKey];

                                    if (!cell) {
                                        return (
                                            <td
                                                key={moduleKey}
                                                className="border-b border-r border-table-border bg-muted p-3 text-center text-xs text-muted-foreground"
                                            >
                                                N/A
                                            </td>
                                        );
                                    }

                                    return (
                                        <td
                                            key={moduleKey}
                                            className="border-b border-r border-table-border bg-background p-3"
                                        >
                                            {displayAnswer(row.question_id, cell.answer)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    function renderOldAnswerDetail() {
        const answers = selectedDetail?.answers || [];

        if (answers.length === 0) {
            return null;
        }

        return (
            <div className="mt-4 overflow-x-auto rounded-md border border-table-border">
                <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead className="bg-table-header text-left text-table-header-foreground">
                        <tr>
                            <th className="border-b border-r border-white/20 p-3">Question</th>
                            <th className="border-b border-r border-white/20 p-3">Answer</th>
                            <th className="border-b border-r border-white/20 p-3">Role</th>
                            <th className="border-b border-r border-white/20 p-3">Applies To</th>
                        </tr>
                    </thead>

                    <tbody>
                        {answers.map((answer) => (
                            <tr
                                key={`${answer.submission_id}-${answer.question_id}`}
                                className="border-t even:bg-table-stripe hover:bg-table-hover"
                            >
                                <td className="border-b border-r border-table-border p-3">
                                    {answer.display_label ||
                                        answer.question_id}
                                </td>
                                <td className="border-b border-r border-table-border p-3">{displayAnswer(answer.question_id, answer.answer)}</td>
                                <td className="border-b border-r border-table-border p-3">{answer.role}</td>
                                <td className="border-b border-r border-table-border p-3">
                                    {(answer.applies_to || []).join(', ')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    function renderSubmissionDetail() {
        if (!selectedDetail) {
            return null;
        }

        const hasCells = (selectedDetail.cells || []).length > 0;
        const hasAnswers = (selectedDetail.answers || []).length > 0;

        return (
            <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {selectedDetail.submission?.status === 'draft' && isAuthenticated && !isGuest ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onContinueEditing(selectedDetail.submission.submission_id)}
                            >
                                Continue Editing
                            </Button>
                        ) : null}
                        {renderDeleteControl(
                            selectedDetail.submission?.submission_id,
                        )}
                        {!isAuthenticated && <Link className="text-sm underline" to={loginPath(location.pathname + location.search)}>Log in to edit</Link>}
                        {selectedDetail.submission?.status === 'final' && isAuthenticated && !isAdmin &&
                            <span className="text-sm text-muted-foreground">Only admins can edit final submissions</span>}
                    </div>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                        <span className="font-medium">Status:</span>{' '}
                        {selectedDetail.submission?.status === 'draft'
                            ? 'Draft'
                            : 'Final'}
                    </div>

                    <div>
                        <span className="font-medium">Product:</span>{' '}
                        {selectedDetail.submission?.product_name}
                    </div>

                    <div>
                        <span className="font-medium">ProdGroup3:</span>{' '}
                        {selectedDetail.submission?.prodgroup3}
                    </div>

                    <div>
                        <span className="font-medium">Operation:</span>{' '}
                        {displayAnswer('operation', selectedDetail.submission?.operation)}
                    </div>

                    <div>
                        <span className="font-medium">Modules:</span>{' '}
                        {(
                            selectedDetail.submission?.selected_modules || []
                        ).join(', ')}
                    </div>
                </div>

                {hasCells ? renderMatrixDetail() : null}

                {!hasCells && hasAnswers ? renderOldAnswerDetail() : null}

                {!hasCells && !hasAnswers ? (
                    <div className="mt-4 rounded-md border p-3 text-sm text-muted-foreground">
                        No answers or matrix cells found for this submission.
                    </div>
                ) : null}
                <section className="mt-4 border-t pt-3 text-sm" aria-label="Edit history">
                    <h3 className="font-medium">Edit history</h3>
                    {historyError ? <p role="alert">{historyError}</p> : null}
                    {!historyError && !history.length ? <p className="text-muted-foreground">No edits yet</p> : null}
                    {history.length ? <ul className="mt-2 space-y-2">{history.map((entry) => (
                        <li key={entry.history_id} className="border-b pb-2">
                            <span className="font-medium">{entry.action}</span>{' · '}
                            <time dateTime={entry.changed_at}>{new Date(entry.changed_at).toLocaleString()}</time>{' · '}
                            {entry.changed_by}
                            {entry.reason ? <p className="text-muted-foreground">{entry.reason}</p> : null}
                        </li>
                    ))}</ul> : null}
                </section>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-3 md:min-h-0 md:flex-1 md:overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <h1 className="sr-only">Quality Matrix</h1>
                {modeSwitch}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <label htmlFor="review-search" className="text-sm font-medium">
                        Search
                    </label>
                    <Input
                        id="review-search"
                        type="search"
                        placeholder="Search submissions"
                        className="w-44 sm:w-52"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />
                    <label htmlFor="review-status" className="text-sm font-medium">
                        Status
                    </label>
                    <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
                        <SelectTrigger id="review-status" className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            {statuses.map((status) => <SelectItem key={status} value={status}>{status === 'draft' ? 'Draft' : status === 'final' ? 'Final' : status}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <span role="status" aria-live="polite" className="whitespace-nowrap text-sm text-muted-foreground">
                        {filtered.length} submissions found
                    </span>
                    <Button
                        ref={refreshButton}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={loadSubmissions}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            {(loading || statusMessage) ? (
                <div className="shrink-0 text-sm" role={statusKind === 'error' && statusMessage ? 'alert' : 'status'} aria-live="polite">
                    {statusMessage.length > 180 ? (
                        <details className={statusKind === 'error' ? 'text-destructive' : ''}>
                            <summary className="cursor-pointer">{statusKind === 'error' ? 'Request failed. Show details' : 'Show message'}</summary>
                            <p className="mt-1 whitespace-pre-wrap break-words">{statusMessage}</p>
                        </details>
                    ) : (
                        <span className={statusKind === 'error' ? 'text-destructive' : ''}>
                            {loading ? 'Working... ' : ''}{statusMessage}
                        </span>
                    )}
                </div>
            ) : null}

            <div className="min-h-[320px] min-w-0 overflow-auto rounded-md border border-table-border bg-card md:min-h-0 md:flex-1">
                {visibleSubmissions.length === 0 ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                        <p>{loading ? 'Loading submissions...' : listError
                            ? 'Unable to load submissions.' : submissions.length === 0
                                ? 'No submissions found.' : 'No matching submissions.'}</p>
                        {!loading && submissions.length > 0 && !filtered.length ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setPage(1); }}>Clear filters</Button>
                        ) : null}
                    </div>
                ) : (
                    <table className="w-full min-w-[64rem] border-separate border-spacing-0 text-sm">
                    <thead className="text-left text-table-header-foreground">
                        <tr>
                            {sortHeader('created_at', 'Created At')}
                            {sortHeader('status', 'Status')}
                            {sortHeader('product_name', 'Product')}
                            {sortHeader('prodgroup3', 'ProdGroup3')}
                            {['Operation', 'Modules', 'Role', 'Submitted By', 'Action'].map((label) => (
                                <th key={label} scope="col" className="sticky top-0 z-10 border-b border-r border-white/20 bg-table-header p-3">{label}</th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {visibleSubmissions.map((item) => {
                            const isDraft = item.status === 'draft';

                            return (
                                <tr
                                    key={item.submission_id}
                                    className="border-t even:bg-table-stripe hover:bg-table-hover"
                                >
                                    <td className="border-b border-r border-table-border p-3">{item.created_at}</td>
                                    <td className="border-b border-r border-table-border p-3">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                isDraft
                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                                                    : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
                                            }`}
                                        >
                                            {isDraft ? 'Draft' : 'Final'}
                                        </span>
                                    </td>
                                    <td className="border-b border-r border-table-border p-3">{item.product_name}</td>
                                    <td className="border-b border-r border-table-border p-3">{item.prodgroup3}</td>
                                    <td className="border-b border-r border-table-border p-3">{displayAnswer('operation', item.operation)}</td>
                                    <td className="border-b border-r border-table-border p-3">
                                        {(item.selected_modules || []).join(
                                            ', ',
                                        )}
                                    </td>
                                    <td className="border-b border-r border-table-border p-3">{item.role}</td>
                                    <td className="border-b border-r border-table-border p-3">
                                        {item.submitted_by}
                                    </td>
                                    <td className="border-b border-r border-table-border p-3">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className="rounded-md bg-primary px-3 py-1 text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                                onClick={(event) => {
                                                    detailTrigger.current = event.currentTarget;
                                                    loadSubmissionDetail(item.submission_id);
                                                }}
                                            >
                                                View
                                            </button>

                                            {isDraft && isAuthenticated && !isGuest ? (
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-amber-700 px-3 py-1 text-amber-800 dark:text-amber-300"
                                                    onClick={() =>
                                                        onContinueEditing(
                                                            item.submission_id,
                                                        )
                                                    }
                                                >
                                                    Continue Editing
                                                </button>
                                            ) : null}

                                            {renderDeleteControl(
                                                item.submission_id,
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    </table>
                )}
            </div>

            <ClientPagination label="Submissions" total={sorted.length} page={currentPage} pageSize={pageSize}
                onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />

            <Sheet
                open={Boolean(selectedDetail)}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedDetail(null);
                        setPendingDeleteId(null);
                    }
                }}
            >
                <SheetContent
                    side="right"
                    className="flex w-full max-w-none flex-col overflow-hidden p-4 sm:w-[min(90vw,60rem)] sm:max-w-none"
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const target = detailTrigger.current?.isConnected
                            ? detailTrigger.current
                            : refreshButton.current;
                        target?.focus();
                        detailTrigger.current = null;
                    }}
                >
                    <SheetHeader className="shrink-0 pr-8 text-left">
                        <SheetTitle>Submission Detail</SheetTitle>
                        <SheetDescription>
                            ID: {selectedDetail?.submission?.submission_id}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-auto">
                        {renderSubmissionDetail()}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}