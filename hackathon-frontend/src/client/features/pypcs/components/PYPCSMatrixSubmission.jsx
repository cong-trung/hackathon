import { useEffect, useMemo, useState } from 'react';

import { scrollbarClassName } from '@/shared/utils/scrollbar';

const API_BASE = '/api';
const MIN_TP_NAME_LENGTH = 7;

// Editing the first selected module's answer auto-fills the rest of the row.
const AUTO_FILL_FROM_FIRST_QUESTION_IDS = new Set(['nsb']);

// These fields are the same across every module, so render one shared input per row.
const SHARED_ACROSS_MODULES_QUESTION_IDS = new Set([
    'product_name',
    'implementation_stage',
    'xvi_tool_type',
    'fab_technology',
    'segment',
    'lts_ball',
]);

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(text || response.statusText);
    }

    if (!text) {
        return {};
    }

    return JSON.parse(text);
}

function getCellKey(questionId, moduleKey) {
    return `${questionId}__${moduleKey}`;
}

function isQuestionApplicableToModule(question, moduleKey) {
    return Array.isArray(question.applies_to)
        && question.applies_to.includes(moduleKey);
}

export default function PYPCSMatrixSubmission({
    resumeSubmission = null,
    onResumeHandled = () => {},
} = {}) {
    const [modules, setModules] = useState([]);
    const [selectedModules, setSelectedModules] = useState([]);
    const [role, setRole] = useState('TI');
    const [questions, setQuestions] = useState([]);
    const [cells, setCells] = useState({});
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [submissionId, setSubmissionId] = useState(null);
    const [submissionStatus, setSubmissionStatus] = useState(null);
    const [editingDescriptionId, setEditingDescriptionId] = useState(null);
    const [descriptionDrafts, setDescriptionDrafts] = useState({});

    const sortedModules = useMemo(() => {
        return [...modules].sort((a, b) => {
            return Number(a.sort_order || 0) - Number(b.sort_order || 0);
        });
    }, [modules]);

    function backendRole(currentRole) {
        return currentRole === 'ALL' ? null : currentRole;
    }

    function resetForm() {
        setSelectedModules([]);
        setRole('TI');
        setQuestions([]);
        setCells({});
        setErrors({});
        setSubmissionId(null);
        setSubmissionStatus(null);
        setStatusMessage('');
    }

    useEffect(() => {
        async function loadModules() {
            setLoading(true);
            setStatusMessage('');

            try {
                const result = await requestJson('/pypcs/modules');
                setModules(result.items || []);
            } catch (error) {
                setStatusMessage(`Failed to load modules: ${error.message}`);
            } finally {
                setLoading(false);
            }
        }

        loadModules();
    }, []);

    async function refreshQuestions(nextSelectedModules, nextRole = role) {
        if (nextSelectedModules.length === 0) {
            setQuestions([]);
            setCells({});
            setErrors({});
            return;
        }

        setLoading(true);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/visible-questions', {
                method: 'POST',
                body: JSON.stringify({
                    selected_modules: nextSelectedModules,
                    role: backendRole(nextRole),
                }),
            });

            setQuestions(result.items || []);
            setErrors({});
        } catch (error) {
            setStatusMessage(`Failed to load matrix: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!resumeSubmission) {
            return;
        }

        const sub = resumeSubmission.submission || {};
        const nextModules = sub.selected_modules || [];
        const nextRole = sub.role ? sub.role.toUpperCase() : 'ALL';

        const nextCells = {};
        (resumeSubmission.cells || []).forEach((cell) => {
            nextCells[getCellKey(cell.question_id, cell.module_key)] =
                cell.answer || '';
        });

        setSelectedModules(nextModules);
        setRole(nextRole);
        setCells(nextCells);
        setErrors({});
        setSubmissionId(sub.submission_id || null);
        setSubmissionStatus(sub.status || 'final');
        setStatusMessage('');

        refreshQuestions(nextModules, nextRole);
        onResumeHandled();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeSubmission]);

    async function handleModuleToggle(moduleKey) {
        const nextSelectedModules = selectedModules.includes(moduleKey)
            ? selectedModules.filter((item) => item !== moduleKey)
            : [...selectedModules, moduleKey];

        setSelectedModules(nextSelectedModules);
        await refreshQuestions(nextSelectedModules);
    }

    async function handleRoleChange(nextRole) {
        setRole(nextRole);
        await refreshQuestions(selectedModules, nextRole);
    }

    function handleCellChange(questionId, moduleKey, value) {
        const cellKey = getCellKey(questionId, moduleKey);
        const isFirstModule = selectedModules[0] === moduleKey;
        const shouldAutoFill =
            isFirstModule && AUTO_FILL_FROM_FIRST_QUESTION_IDS.has(questionId);
        const question = questions.find(
            (item) => item.question_id === questionId,
        );

        setCells((previousCells) => {
            const nextCells = { ...previousCells, [cellKey]: value };

            if (shouldAutoFill && question) {
                selectedModules.forEach((otherModuleKey) => {
                    if (otherModuleKey === moduleKey) {
                        return;
                    }

                    if (
                        !isQuestionApplicableToModule(question, otherModuleKey)
                    ) {
                        return;
                    }

                    nextCells[getCellKey(questionId, otherModuleKey)] = value;
                });
            }

            return nextCells;
        });

        setErrors((previousErrors) => {
            const nextErrors = { ...previousErrors };
            delete nextErrors[cellKey];

            if (shouldAutoFill && question) {
                selectedModules.forEach((otherModuleKey) => {
                    delete nextErrors[getCellKey(questionId, otherModuleKey)];
                });
            }

            return nextErrors;
        });
    }

    function handleSharedFieldChange(question, value) {
        setCells((previousCells) => {
            const nextCells = { ...previousCells };

            selectedModules.forEach((moduleKey) => {
                if (!isQuestionApplicableToModule(question, moduleKey)) {
                    return;
                }

                nextCells[getCellKey(question.question_id, moduleKey)] = value;
            });

            return nextCells;
        });

        setErrors((previousErrors) => {
            const nextErrors = { ...previousErrors };

            selectedModules.forEach((moduleKey) => {
                delete nextErrors[getCellKey(question.question_id, moduleKey)];
            });

            return nextErrors;
        });
    }

    function startEditingDescription(question) {
        setDescriptionDrafts((previous) => ({
            ...previous,
            [question.question_id]: question.description || '',
        }));
        setEditingDescriptionId(question.question_id);
    }

    async function handleSaveDescription(questionId) {
        const nextDescription = descriptionDrafts[questionId] ?? '';

        setLoading(true);
        setStatusMessage('');

        try {
            await requestJson(`/pypcs/questions/${questionId}`, {
                method: 'PATCH',
                body: JSON.stringify({ description: nextDescription }),
            });

            setQuestions((previousQuestions) =>
                previousQuestions.map((question) =>
                    question.question_id === questionId
                        ? { ...question, description: nextDescription }
                        : question,
                ),
            );
            setEditingDescriptionId(null);
        } catch (error) {
            setStatusMessage(`Failed to save description: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    function getFirstAnswerForQuestion(question) {
        for (const moduleKey of selectedModules) {
            const cellKey = getCellKey(question.question_id, moduleKey);
            const value = cells[cellKey];

            if (value && String(value).trim() !== '') {
                return value;
            }
        }

        return '';
    }

    function validateTpNameLength() {
        const nextErrors = {};

        questions.forEach((question) => {
            if (question.question_id !== 'tp_name') {
                return;
            }

            selectedModules.forEach((moduleKey) => {
                if (!isQuestionApplicableToModule(question, moduleKey)) {
                    return;
                }

                const cellKey = getCellKey(question.question_id, moduleKey);
                const value = String(cells[cellKey] || '').trim();

                if (value && value.length < MIN_TP_NAME_LENGTH) {
                    nextErrors[cellKey] =
                        `TP name must be at least ${MIN_TP_NAME_LENGTH} characters`;
                }
            });
        });

        return nextErrors;
    }

    function validateMatrix() {
        const nextErrors = {};

        questions.forEach((question) => {
            if (!question.required) {
                return;
            }

            const hasAnswer = selectedModules.some((moduleKey) => {
                if (!isQuestionApplicableToModule(question, moduleKey)) {
                    return false;
                }

                const cellKey = getCellKey(question.question_id, moduleKey);
                const value = cells[cellKey];

                return value && String(value).trim() !== '';
            });

            if (!hasAnswer) {
                selectedModules.forEach((moduleKey) => {
                    if (isQuestionApplicableToModule(question, moduleKey)) {
                        const cellKey = getCellKey(
                            question.question_id,
                            moduleKey,
                        );

                        nextErrors[cellKey] =
                            `${question.display_label || question.header || question.question_id} is required`;
                    }
                });
            }
        });

        return nextErrors;
    }

    function collectSubmittedCells() {
        const submittedCells = [];

        questions.forEach((question) => {
            selectedModules.forEach((moduleKey) => {
                if (!isQuestionApplicableToModule(question, moduleKey)) {
                    return;
                }

                if (role !== 'ALL' && question.role !== role) {
                    return;
                }

                const cellKey = getCellKey(question.question_id, moduleKey);
                const answer = cells[cellKey] || '';

                if (!answer || String(answer).trim() === '') {
                    return;
                }

                submittedCells.push({
                    question_id: question.question_id,
                    module_key: moduleKey,
                    answer,
                });
            });
        });

        return submittedCells;
    }

    async function saveMatrix(nextStatus) {
        const tpNameErrors = validateTpNameLength();
        const requiredErrors =
            nextStatus === 'final' ? validateMatrix() : {};
        const nextErrors = { ...requiredErrors, ...tpNameErrors };

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setStatusMessage(
                Object.keys(tpNameErrors).length > 0
                    ? 'Please fix invalid matrix cells.'
                    : 'Please complete required matrix cells.',
            );
            return;
        }

        const hasProductName = selectedModules.some((moduleKey) => {
            const value = cells[getCellKey('product_name', moduleKey)];
            return value && String(value).trim() !== '';
        });

        if (!hasProductName) {
            setStatusMessage(
                'Product Name is required, even for drafts (switch to TI '
                    + 'or View All role to enter it).',
            );
            return;
        }

        const submittedCells = collectSubmittedCells();

        const findAnswer = (questionId) => {
            const matchedCell = submittedCells.find(
                (cell) => cell.question_id === questionId,
            );

            return matchedCell?.answer || '';
        };

        const payload = {
            selected_modules: selectedModules,
            role: backendRole(role),
            submitted_by: 'current_user',
            product_name: findAnswer('product_name'),
            prodgroup3: findAnswer('prodgroup3'),
            operation: findAnswer('operation'),
            cells: submittedCells,
            submission_id: submissionId,
            status: nextStatus,
        };

        setLoading(true);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/matrix-submission', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            setSubmissionId(result.submission_id || null);
            setSubmissionStatus(result.status || nextStatus);
            setStatusMessage(
                nextStatus === 'draft'
                    ? `Saved as draft. ID: ${result.submission_id || 'N/A'}`
                    : `Matrix submitted successfully. ID: ${result.submission_id || 'N/A'}`,
            );
        } catch (error) {
            setStatusMessage(`Matrix save failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveDraft() {
        await saveMatrix('draft');
    }

    async function handleSubmitFinal() {
        await saveMatrix('final');
    }

    function renderFieldInput(question, value, onChange) {
        const options = question.options || [];
        const hasOtherOption = options.includes('Other');
        const isOtherSelected =
            hasOtherOption
            && value !== ''
            && (value === 'Other' || !options.includes(value));

        if (question.field_type === 'select') {
            return (
                <>
                    <select
                        className="w-full rounded border px-2 py-1 text-sm"
                        value={isOtherSelected ? 'Other' : value}
                        onChange={(event) => onChange(event.target.value)}
                    >
                        <option value="">Select...</option>
                        {options.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>

                    {isOtherSelected ? (
                        <input
                            className="mt-1 w-full rounded border px-2 py-1 text-sm"
                            type="text"
                            placeholder="Please specify"
                            value={value === 'Other' ? '' : value}
                            onChange={(event) => onChange(event.target.value)}
                        />
                    ) : null}
                </>
            );
        }

        if (question.field_type === 'textarea') {
            return (
                <textarea
                    className="min-h-20 w-full rounded border px-2 py-1 text-sm"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
            );
        }

        return (
            <input
                className="w-full rounded border px-2 py-1 text-sm"
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        );
    }

    function renderCell(question, module) {
        const moduleKey = module.module_key;
        const selected = selectedModules.includes(moduleKey);
        const applicable = isQuestionApplicableToModule(question, moduleKey);
        const editable =
            selected && applicable && (role === 'ALL' || question.role === role);
        const cellKey = getCellKey(question.question_id, moduleKey);
        const value = cells[cellKey] || '';
        const error = errors[cellKey];

        if (!selected || !applicable) {
            return (
                <td
                    key={moduleKey}
                    className="min-w-32 border bg-gray-300 p-2 text-center text-xs text-gray-700"
                >
                    {!selected ? 'Disabled' : 'N/A'}
                </td>
            );
        }

        if (!editable) {
            return (
                <td
                    key={moduleKey}
                    className="min-w-32 border bg-slate-100 p-2 text-xs text-gray-700"
                >
                    Read only
                </td>
            );
        }

        const cellQuestion = question.options_by_module?.[moduleKey]
            ? { ...question, options: question.options_by_module[moduleKey] }
            : question;

        return (
            <td key={moduleKey} className="min-w-40 border bg-green-100 p-2">
                {renderFieldInput(cellQuestion, value, (nextValue) =>
                    handleCellChange(question.question_id, moduleKey, nextValue),
                )}

                {error ? (
                    <div className="mt-1 text-xs text-red-600">{error}</div>
                ) : null}
            </td>
        );
    }

    function renderSharedFieldRow(question) {
        const applicableModules = selectedModules.filter((moduleKey) =>
            isQuestionApplicableToModule(question, moduleKey),
        );

        if (applicableModules.length === 0) {
            return (
                <td
                    colSpan={sortedModules.length}
                    className="border bg-gray-300 p-2 text-center text-xs text-gray-700"
                >
                    N/A
                </td>
            );
        }

        const editable = role === 'ALL' || question.role === role;

        if (!editable) {
            return (
                <td
                    colSpan={sortedModules.length}
                    className="border bg-slate-100 p-2 text-xs text-gray-700"
                >
                    Read only
                </td>
            );
        }

        const value = getFirstAnswerForQuestion(question);
        const cellKey = getCellKey(question.question_id, applicableModules[0]);
        const error = errors[cellKey];

        return (
            <td colSpan={sortedModules.length} className="border bg-green-100 p-2">
                {renderFieldInput(question, value, (nextValue) =>
                    handleSharedFieldChange(question, nextValue),
                )}

                {error ? (
                    <div className="mt-1 text-xs text-red-600">{error}</div>
                ) : null}
            </td>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">
                    Matrix Submission
                </h2>
                <p className="text-sm text-muted-foreground">
                    Tick module columns, then input answers only in enabled
                    cells.
                </p>
            </div>

            {submissionId ? (
                <div className="flex items-center justify-between rounded-md border bg-slate-50 p-3 text-sm">
                    <div className="flex items-center gap-2">
                        <span>Editing submission ID: {submissionId}</span>

                        <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                submissionStatus === 'draft'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-green-100 text-green-800'
                            }`}
                        >
                            {submissionStatus === 'draft' ? 'Draft' : 'Final'}
                        </span>
                    </div>

                    <button
                        type="button"
                        className="rounded-md border px-3 py-1 text-sm"
                        onClick={resetForm}
                    >
                        New Submission
                    </button>
                </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="matrix-role">
                        Role
                    </label>

                    <select
                        id="matrix-role"
                        className="rounded-md border px-3 py-2"
                        value={role}
                        onChange={(event) =>
                            handleRoleChange(event.target.value)
                        }
                        disabled={loading}
                    >
                        <option value="TI">TI</option>
                        <option value="ME">ME</option>
                        <option value="ALL">View All (TI + ME)</option>
                    </select>
                </div>

                <div className="flex items-center gap-3">
                    {statusMessage ? (
                        <div className="text-sm">{statusMessage}</div>
                    ) : null}

                    <button
                        type="button"
                        className="rounded-md border px-4 py-2 disabled:opacity-50"
                        onClick={handleSaveDraft}
                        disabled={loading || selectedModules.length === 0}
                    >
                        {loading ? 'Working...' : 'Save Draft'}
                    </button>

                    <button
                        type="button"
                        className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                        onClick={handleSubmitFinal}
                        disabled={loading || selectedModules.length === 0}
                    >
                        {loading ? 'Working...' : 'Submit Final'}
                    </button>
                </div>
            </div>

            <div
                className={`overflow-auto rounded-md border bg-white max-h-[70vh] ${scrollbarClassName}`}
            >
                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr className="bg-slate-50">
                            <th className="sticky left-0 top-0 z-30 w-12 border bg-slate-50 p-2">
                                No
                            </th>
                            <th className="sticky left-12 top-0 z-30 w-64 border bg-slate-50 py-2 pl-2 pr-3 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.35)]">
                                Header
                            </th>
                            <th className="sticky top-0 z-20 w-80 border bg-slate-50 py-2 pl-4 pr-2">
                                Description
                            </th>
                            <th className="sticky top-0 z-20 w-16 border bg-slate-50 p-2">
                                Role
                            </th>

                            {sortedModules.map((module) => (
                                <th
                                    key={module.module_key}
                                    className="sticky top-0 z-20 w-40 border bg-slate-50 p-2"
                                >
                                    <label className="flex flex-col items-center gap-1">
                                        <input
                                            type="checkbox"
                                            checked={selectedModules.includes(
                                                module.module_key,
                                            )}
                                            disabled={
                                                !module.enabled_default || loading
                                            }
                                            onChange={() =>
                                                handleModuleToggle(
                                                    module.module_key,
                                                )
                                            }
                                        />

                                        <span>
                                            {module.module_label ||
                                                module.module_key}
                                        </span>
                                    </label>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {questions.length === 0 ? (
                            <tr>
                                <td
                                    className="border p-3 text-muted-foreground"
                                    colSpan={4 + sortedModules.length}
                                >
                                    {selectedModules.length === 0
                                        ? 'Tick at least one module to show matrix rows.'
                                        : 'No matrix rows found.'}
                                </td>
                            </tr>
                        ) : null}

                        {questions.map((question, index) => (
                            <tr key={question.question_id}>
                                <td className="sticky left-0 z-10 w-12 border bg-white p-2 text-center">
                                    {index + 1}
                                </td>

                                <td className="sticky left-12 z-10 w-64 border bg-green-600 py-2 pl-2 pr-3 align-top font-medium text-white shadow-[6px_0_8px_-6px_rgba(0,0,0,0.35)]">
                                    {question.display_label ||
                                        question.header ||
                                        question.question_id}
                                </td>

                                <td className="border bg-green-100 py-2 pl-4 pr-2 text-xs align-top break-words">
                                    {editingDescriptionId ===
                                    question.question_id ? (
                                        <div className="flex flex-col gap-1">
                                            <textarea
                                                className="min-h-16 w-full rounded border px-2 py-1 text-xs"
                                                value={
                                                    descriptionDrafts[
                                                        question.question_id
                                                    ] ?? ''
                                                }
                                                onChange={(event) =>
                                                    setDescriptionDrafts(
                                                        (previous) => ({
                                                            ...previous,
                                                            [question.question_id]:
                                                                event.target
                                                                    .value,
                                                        }),
                                                    )
                                                }
                                            />

                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-50"
                                                    onClick={() =>
                                                        handleSaveDescription(
                                                            question.question_id,
                                                        )
                                                    }
                                                    disabled={loading}
                                                >
                                                    Save
                                                </button>

                                                <button
                                                    type="button"
                                                    className="rounded border px-2 py-1"
                                                    onClick={() =>
                                                        setEditingDescriptionId(
                                                            null,
                                                        )
                                                    }
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : question.description ? (
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="min-w-0 break-words">
                                                {question.description}
                                            </span>

                                            <button
                                                type="button"
                                                className="shrink-0 text-blue-600 underline"
                                                onClick={() =>
                                                    startEditingDescription(
                                                        question,
                                                    )
                                                }
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className="text-blue-600 underline"
                                            onClick={() =>
                                                startEditingDescription(
                                                    question,
                                                )
                                            }
                                        >
                                            + Add description
                                        </button>
                                    )}
                                </td>

                                <td className="border p-2 text-center font-medium">
                                    {question.role}
                                </td>

                                {SHARED_ACROSS_MODULES_QUESTION_IDS.has(
                                    question.question_id,
                                )
                                    ? renderSharedFieldRow(question)
                                    : sortedModules.map((module) =>
                                          renderCell(question, module),
                                      )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}