import { useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowDown, ArrowUp } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import store from '@/app/store';
import { apiSlice } from '@/app/api/apiSlice';
import { useGetSubmissionsMetaQuery, useGetSubmissionsPageQuery } from '@/app/api/pypcsSubmissionsApi';
import { authErrorMessage, loginPath, useAuth } from '@/shared/hooks/useAuth';
import ServerPagination from '@/shared/components/data-table/ServerPagination';
import LazyTabs from '@/shared/components/lazy-tabs/LazyTabs';
import useServerTable from '@/shared/hooks/useServerTable';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/shared/components/ui/sheet';
import { mergeSubmissionTabs } from '../tabs.config';

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

function detailMessage(error) {
    if (typeof error.detail === 'string') return error.detail;
    if (typeof error.detail?.message === 'string') return error.detail.message;
    if (Array.isArray(error.detail)) {
        return error.detail.map((entry) => entry.msg || entry.message).filter(Boolean).join('; ') || 'Please try again.';
    }
    return 'Please try again.';
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

function displayAnswer(questionId, answer, fieldType) {
    return questionId === 'operation' || questionId === 'prodgroup3' || fieldType === 'multiselect'
        ? (answer || '').split('|').join(', ') : answer;
}

const statusLabels = { draft: 'Draft', waiting_me: 'Waiting for ME', final: 'Final' };

export default function PYPCSSubmissionsReview({
    onContinueEditing = () => {},
    modeSwitch,
} = {}) {
    const [selectedDetail, setSelectedDetail] = useState(null);
    const detailTrigger = useRef(null);
    const refreshButton = useRef(null);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [statusKind, setStatusKind] = useState('success');
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const { isAuthenticated, isAdmin, isME } = useAuth();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [history, setHistory] = useState([]);
    const [historyError, setHistoryError] = useState('');
    const [assignedOnly, setAssignedOnly] = useState(false);
    const tableState = useServerTable({ tabKey: searchParams.get('tab') });
    const metaQuery = useGetSubmissionsMetaQuery();
    const tabs = mergeSubmissionTabs(metaQuery.currentData);
    const requestedTab = searchParams.get('tab') ?? 'all';
    const activeTab = tabs.some((tab) => tab.key === requestedTab) ? requestedTab : 'all';
    const listQuery = useGetSubmissionsPageQuery({
        ...tableState.args, status: activeTab === 'all' ? undefined : activeTab,
        assigned_to_me: isME && assignedOnly ? true : undefined,
    }, { skip: !metaQuery.currentData || metaQuery.isError });
    const submissions = listQuery.currentData?.items ?? [];
    const visibleSubmissions = submissions;

    function changeSort(key) {
        tableState.changeSort(key);
    }

    function sortHeader(key, label) {
        const direction = tableState.sort === key ? (tableState.dir === 'asc' ? 'ascending' : 'descending') : 'none';
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
        setStatusMessage('');

        try {
            await Promise.all([metaQuery.refetch().unwrap(), listQuery.refetch().unwrap()]);
            return true;
        } catch (error) {
            setStatusKind('error');
            setStatusMessage(`Failed to load submissions: ${error.message}`);
            return false;
        }
    }

    async function loadSubmissionDetail(submissionId) {
        setLoading(true);
        setStatusMessage('');

        try {
            const result = await requestJson(
                `/pypcs/submissions/${encodeURIComponent(submissionId)}`,
            );

            setSelectedDetail(result);
            setHistory([]);
            setHistoryError('');
            try {
                const entries = await requestJson(`/pypcs/submissions/${encodeURIComponent(submissionId)}/history`);
                setHistory(Array.isArray(entries) ? entries : entries.items || []);
            } catch {
                setHistoryError('Unable to load edit history.');
            }
        } catch (error) {
            detailTrigger.current = null;
            setSelectedDetail(null);
            setHistory([]);
            setHistoryError('');
            if (error.status === 404) {
                if (await loadSubmissions()) {
                    setStatusKind('error');
                    setStatusMessage('This submission no longer exists. The list has been refreshed.');
                }
                return;
            }
            setStatusKind('error');
            setStatusMessage(
                `Failed to load submission detail: ${detailMessage(error)}`,
            );
        } finally {
            setLoading(false);
        }
    }

    function requestDeleteSubmission(submissionId) {
        const submission = submissions.find((item) => item.submission_id === submissionId);
        if (!(selectedDetail?.submission?.submission_id === submissionId
            ? selectedDetail.permissions?.can_delete : submission?.can_delete)) return;
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
            store.dispatch(apiSlice.util.invalidateTags(['PYPCSSubmissions']));
            tableState.resetOffset();

            if (selectedDetail?.submission?.submission_id === submissionId) {
                setSelectedDetail(null);
            }

            setPendingDeleteId(null);
            if (await loadSubmissions()) {
                setStatusKind('success');
                setStatusMessage('Submission deleted.');
            }
        } catch (error) {
            if (error.status === 404) {
                setPendingDeleteId(null);
                if (selectedDetail?.submission?.submission_id === submissionId) {
                    setSelectedDetail(null);
                }
                if (await loadSubmissions()) {
                    setStatusKind('success');
                    setStatusMessage('Submission was already deleted; list refreshed.');
                }
                return;
            }
            if (error.status !== 401 && error.status !== 403) {
                setPendingDeleteId(null);
                await loadSubmissions();
            }
            setStatusKind('error');
            setStatusMessage(error.status === 401 || error.status === 403
                ? authErrorMessage(error) : `Failed to delete submission: ${typeof error.detail === 'string' ? error.detail : error.message}`);
        } finally {
            setLoading(false);
        }
    }

    function renderDeleteControl(submissionId) {
        if (!(selectedDetail?.submission?.submission_id === submissionId
            ? selectedDetail.permissions?.can_delete
            : submissions.find((item) => item.submission_id === submissionId)?.can_delete)) return null;
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
                                <td className="border-b border-r border-table-border bg-table-frozen p-3 font-medium text-foreground">
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
                                            {displayAnswer(row.question_id, cell.answer, cell.field_type)}
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
                                <td className="border-b border-r border-table-border p-3">{displayAnswer(answer.question_id, answer.answer, answer.field_type)}</td>
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
                        {selectedDetail.permissions?.can_edit && (selectedDetail.submission?.status !== 'final' || isAdmin) ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onContinueEditing(selectedDetail.submission.submission_id)}
                            >
                                {selectedDetail.submission?.status === 'final' ? 'Edit (admin)' : 'Continue Editing'}
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
                        <span className={selectedDetail.submission?.status === 'waiting_me' ? 'rounded-full bg-status-info px-2 py-0.5 text-status-info-foreground' : ''}>
                            {statusLabels[selectedDetail.submission?.status] || selectedDetail.submission?.status}
                        </span>
                    </div>

                    <div>
                        <span className="font-medium">Product:</span>{' '}
                        {selectedDetail.submission?.product_name}
                    </div>

                    <div>
                        <span className="font-medium">ProdGroup3:</span>{' '}
                        {displayAnswer('prodgroup3', selectedDetail.submission?.prodgroup3)}
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
                <h1 className="sr-only">Product Info</h1>
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
                        value={tableState.search}
                        onChange={(event) => tableState.setSearch(event.target.value)}
                    />
                    {isME && <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={assignedOnly}
                        onChange={(event) => { setAssignedOnly(event.target.checked); tableState.resetOffset(); }} />Assigned to me ({metaQuery.currentData?.assigned_to_me_count ?? 0})</label>}
                    <span role="status" aria-live="polite" className="whitespace-nowrap text-sm text-muted-foreground">
                        {listQuery.currentData?.total ?? 0} submissions found
                    </span>
                    <Button
                        ref={refreshButton}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={loadSubmissions}
                        disabled={loading || listQuery.isFetching}
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

            {metaQuery.isError && <p role="alert" className="text-sm text-destructive">Could not load submission tabs. <Button type="button" variant="outline" onClick={metaQuery.refetch}>Retry</Button></p>}
            <LazyTabs tabs={tabs} activeKey={requestedTab} loading={!metaQuery.currentData} onChange={() => tableState.resetOffset()} renderPanel={() => (
            <>
            <div className="min-h-[320px] min-w-0 overflow-auto rounded-md border border-table-border bg-card md:min-h-0 md:flex-1">
                {visibleSubmissions.length === 0 ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                        <p>{listQuery.isError ? 'Unable to load submissions.' : listQuery.isLoading || listQuery.isFetching || loading ? 'Loading submissions...'
                            : (listQuery.currentData?.total ?? 0) === 0 && !tableState.search && !assignedOnly && activeTab === 'all'
                                ? 'No submissions found.' : 'No matching submissions.'}</p>
                        {listQuery.isError ? <Button type="button" variant="outline" size="sm" onClick={listQuery.refetch}>Retry</Button> : null}
                        {!listQuery.isFetching && (tableState.search || assignedOnly || activeTab !== 'all') && !listQuery.isError ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => { tableState.setSearch(''); setAssignedOnly(false); tableState.resetOffset(); }}>Clear filters</Button>
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
                                                isDraft ? 'bg-status-warning text-status-warning-foreground'
                                                    : item.status === 'waiting_me' ? 'bg-status-info text-status-info-foreground'
                                                        : 'bg-status-success text-status-success-foreground'
                                            }`}
                                        >
                                            {statusLabels[item.status] || item.status}
                                        </span>
                                    </td>
                                    <td className="border-b border-r border-table-border p-3">{item.product_name}</td>
                                    <td className="border-b border-r border-table-border p-3">{displayAnswer('prodgroup3', item.prodgroup3)}</td>
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

                                            {item.can_edit && (item.status !== 'final' || isAdmin) ? (
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-status-warning-foreground px-3 py-1 text-status-warning-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                                                    onClick={() =>
                                                        onContinueEditing(
                                                            item.submission_id,
                                                        )
                                                    }
                                                >
                                                    {item.status === 'final' ? 'Edit (admin)' : 'Continue Editing'}
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

            {!listQuery.isError && <ServerPagination label="Submissions" total={listQuery.currentData?.total ?? 0}
                limit={tableState.limit} offset={tableState.offset} onOffsetChange={tableState.setOffset} onLimitChange={tableState.changeLimit} />}
            </>
            )} />

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