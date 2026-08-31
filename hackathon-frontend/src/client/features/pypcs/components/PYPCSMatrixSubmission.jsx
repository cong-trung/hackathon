import { useEffect, useMemo, useState } from 'react';

const API_BASE = '/api';
const MIN_TP_NAME_LENGTH = 7;

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

        setCells((previousCells) => ({
            ...previousCells,
            [cellKey]: value,
        }));

        setErrors((previousErrors) => {
            const nextErrors = { ...previousErrors };
            delete nextErrors[cellKey];
            return nextErrors;
        });
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

        const options = question.options || [];
        const hasOtherOption = options.includes('Other');
        const isOtherSelected =
            hasOtherOption
            && value !== ''
            && (value === 'Other' || !options.includes(value));

        return (
            <td key={moduleKey} className="min-w-40 border bg-green-100 p-2">
                {question.field_type === 'select' ? (
                    <>
                        <select
                            className="w-full rounded border px-2 py-1 text-sm"
                            value={isOtherSelected ? 'Other' : value}
                            onChange={(event) =>
                                handleCellChange(
                                    question.question_id,
                                    moduleKey,
                                    event.target.value,
                                )
                            }
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
                                onChange={(event) =>
                                    handleCellChange(
                                        question.question_id,
                                        moduleKey,
                                        event.target.value,
                                    )
                                }
                            />
                        ) : null}
                    </>
                ) : question.field_type === 'textarea' ? (
                    <textarea
                        className="min-h-20 w-full rounded border px-2 py-1 text-sm"
                        value={value}
                        onChange={(event) =>
                            handleCellChange(
                                question.question_id,
                                moduleKey,
                                event.target.value,
                            )
                        }
                    />
                ) : (
                    <input
                        className="w-full rounded border px-2 py-1 text-sm"
                        type="text"
                        value={value}
                        onChange={(event) =>
                            handleCellChange(
                                question.question_id,
                                moduleKey,
                                event.target.value,
                            )
                        }
                    />
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

            <div className="flex items-center gap-2">
                <label className="text-sm font-medium" htmlFor="matrix-role">
                    Role
                </label>

                <select
                    id="matrix-role"
                    className="rounded-md border px-3 py-2"
                    value={role}
                    onChange={(event) => handleRoleChange(event.target.value)}
                    disabled={loading}
                >
                    <option value="TI">TI</option>
                    <option value="ME">ME</option>
                    <option value="ALL">View All (TI + ME)</option>
                </select>
            </div>

            <div className="overflow-x-auto rounded-md border bg-white">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-slate-50">
                            <th className="min-w-12 border p-2">No</th>
                            <th className="min-w-64 border p-2">Header</th>
                            <th className="min-w-80 border p-2">
                                Description
                            </th>
                            <th className="min-w-16 border p-2">Role</th>

                            {sortedModules.map((module) => (
                                <th
                                    key={module.module_key}
                                    className="min-w-40 border p-2"
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
                                <td className="border p-2 text-center">
                                    {index + 1}
                                </td>

                                <td className="border bg-green-600 p-2 font-medium text-white">
                                    {question.display_label ||
                                        question.header ||
                                        question.question_id}
                                </td>

                                <td className="border bg-green-100 p-2 text-xs">
                                    {question.description}
                                </td>

                                <td className="border p-2 text-center font-medium">
                                    {question.role}
                                </td>

                                {sortedModules.map((module) =>
                                    renderCell(question, module),
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center gap-3">
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

                {statusMessage ? (
                    <div className="text-sm">{statusMessage}</div>
                ) : null}
            </div>
        </div>
    );
}