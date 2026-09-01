import { useEffect, useMemo, useState } from 'react';

const API_BASE = '/api';

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    const text = await response.text();

    if (!response.ok) {
        throw new Error(text || response.statusText);
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

export default function PYPCSSubmissionsReview({
    onContinueEditing = () => {},
} = {}) {
    const [submissions, setSubmissions] = useState([]);
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const matrixRows = useMemo(() => {
        return buildMatrixRows(selectedDetail);
    }, [selectedDetail]);

    async function loadSubmissions() {
        setLoading(true);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/submissions');
            setSubmissions(result.items || []);
        } catch (error) {
            setStatusMessage(`Failed to load submissions: ${error.message}`);
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
        } catch (error) {
            setStatusMessage(
                `Failed to load submission detail: ${error.message}`,
            );
        } finally {
            setLoading(false);
        }
    }

    function requestDeleteSubmission(submissionId) {
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
            setStatusMessage('Submission deleted.');
            await loadSubmissions();
        } catch (error) {
            setStatusMessage(`Failed to delete submission: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadSubmissions();
    }, []);

    function renderDeleteControl(submissionId) {
        if (pendingDeleteId === submissionId) {
            return (
                <div className="flex items-center gap-1">
                    <span className="text-xs text-red-700">Delete?</span>

                    <button
                        type="button"
                        className="rounded-md bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50"
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
                className="rounded-md border border-red-600 px-3 py-1 text-red-700 disabled:opacity-50"
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
            <div className="mt-4 overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-50 text-left">
                        <tr>
                            <th className="min-w-64 border p-3">Question</th>
                            <th className="min-w-80 border p-3">
                                Description
                            </th>
                            <th className="min-w-20 border p-3">Role</th>

                            {selectedModules.map((moduleKey) => (
                                <th
                                    key={moduleKey}
                                    className="min-w-40 border p-3 text-center"
                                >
                                    {moduleKey}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {matrixRows.map((row) => (
                            <tr key={row.question_id}>
                                <td className="border bg-green-600 p-3 font-medium text-white">
                                    {row.display_label}
                                </td>

                                <td className="border bg-green-100 p-3 text-xs">
                                    {row.description}
                                </td>

                                <td className="border p-3 text-center font-medium">
                                    {row.role}
                                </td>

                                {selectedModules.map((moduleKey) => {
                                    const cell = row.cells[moduleKey];

                                    if (!cell) {
                                        return (
                                            <td
                                                key={moduleKey}
                                                className="border bg-gray-300 p-3 text-center text-xs text-gray-700"
                                            >
                                                N/A
                                            </td>
                                        );
                                    }

                                    return (
                                        <td
                                            key={moduleKey}
                                            className="border bg-green-100 p-3"
                                        >
                                            {cell.answer}
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
            <div className="mt-4 max-h-[420px] overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                        <tr>
                            <th className="p-3">Question</th>
                            <th className="p-3">Answer</th>
                            <th className="p-3">Role</th>
                            <th className="p-3">Applies To</th>
                        </tr>
                    </thead>

                    <tbody>
                        {answers.map((answer) => (
                            <tr
                                key={`${answer.submission_id}-${answer.question_id}`}
                                className="border-t"
                            >
                                <td className="p-3">
                                    {answer.display_label ||
                                        answer.question_id}
                                </td>
                                <td className="p-3">{answer.answer}</td>
                                <td className="p-3">{answer.role}</td>
                                <td className="p-3">
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
            <div className="rounded-md border bg-white p-4">
                <div className="mb-3 flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">
                            Submission Detail
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            ID: {selectedDetail.submission?.submission_id}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {renderDeleteControl(
                            selectedDetail.submission?.submission_id,
                        )}

                        <button
                            type="button"
                            className="rounded-md border px-3 py-1 text-sm"
                            onClick={() => setSelectedDetail(null)}
                        >
                            Close
                        </button>
                    </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
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
                        {selectedDetail.submission?.operation}
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
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">
                        PYPCS Submitted Events
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        ME can review submissions created by TI.
                    </p>
                </div>

                <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-sm"
                    onClick={loadSubmissions}
                    disabled={loading}
                >
                    Refresh
                </button>
            </div>

            {statusMessage ? (
                <div className="rounded-md border bg-slate-50 p-3 text-sm">
                    {statusMessage}
                </div>
            ) : null}

            <div className="overflow-hidden rounded-md border bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                        <tr>
                            <th className="p-3">Created At</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Product</th>
                            <th className="p-3">ProdGroup3</th>
                            <th className="p-3">Operation</th>
                            <th className="p-3">Modules</th>
                            <th className="p-3">Role</th>
                            <th className="p-3">Submitted By</th>
                            <th className="p-3">Action</th>
                        </tr>
                    </thead>

                    <tbody>
                        {submissions.length === 0 ? (
                            <tr>
                                <td
                                    className="p-3 text-muted-foreground"
                                    colSpan={9}
                                >
                                    {loading
                                        ? 'Loading submissions...'
                                        : 'No submissions found.'}
                                </td>
                            </tr>
                        ) : null}

                        {submissions.map((item) => {
                            const isDraft = item.status === 'draft';

                            return (
                                <tr
                                    key={item.submission_id}
                                    className="border-t"
                                >
                                    <td className="p-3">{item.created_at}</td>
                                    <td className="p-3">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                isDraft
                                                    ? 'bg-amber-100 text-amber-800'
                                                    : 'bg-green-100 text-green-800'
                                            }`}
                                        >
                                            {isDraft ? 'Draft' : 'Final'}
                                        </span>
                                    </td>
                                    <td className="p-3">{item.product_name}</td>
                                    <td className="p-3">{item.prodgroup3}</td>
                                    <td className="p-3">{item.operation}</td>
                                    <td className="p-3">
                                        {(item.selected_modules || []).join(
                                            ', ',
                                        )}
                                    </td>
                                    <td className="p-3">{item.role}</td>
                                    <td className="p-3">
                                        {item.submitted_by}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className="rounded-md bg-blue-600 px-3 py-1 text-white"
                                                onClick={() =>
                                                    loadSubmissionDetail(
                                                        item.submission_id,
                                                    )
                                                }
                                            >
                                                View
                                            </button>

                                            {isDraft ? (
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-amber-600 px-3 py-1 text-amber-800"
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
            </div>

            {renderSubmissionDetail()}
        </div>
    );
}