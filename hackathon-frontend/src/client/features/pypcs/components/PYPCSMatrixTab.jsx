import { useEffect, useMemo, useState } from 'react';

import PYPCSSubmissionsReview from './PYPCSSubmissionsReview';

import PYPCSMatrixSubmission from './PYPCSMatrixSubmission';
const API_BASE = '/api';

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

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function validateForm(visibleQuestions, answers) {
    const errors = {};

    visibleQuestions.forEach((question) => {
        const questionId = question.question_id;
        const value = answers[questionId];

        if (question.required && (!value || String(value).trim() === '')) {
            errors[questionId] =
                `${question.display_label || question.header || questionId} is required`;
            return;
        }

        if (
            question.field_type === 'select' &&
            value &&
            Array.isArray(question.options) &&
            question.options.length > 0 &&
            !question.options.includes(value)
        ) {
            errors[questionId] =
                `${question.display_label || questionId} must be one of: ${question.options.join(', ')}`;
        }
    });

    return errors;
}

function parseBackendValidationErrors(errorMessage) {
    try {
        const parsed = JSON.parse(errorMessage);
        const missingRequired = parsed?.detail?.missing_required || [];

        if (!Array.isArray(missingRequired)) {
            return {};
        }

        const errors = {};

        missingRequired.forEach((item) => {
            errors[item.question_id] =
                `${item.display_label || item.question_id} is required`;
        });

        return errors;
    } catch {
        return {};
    }
}

export default function PYPCSMatrixTab() {
    const [activeMode, setActiveMode] = useState('matrix');
    const [resumeSubmission, setResumeSubmission] = useState(null);
    const [modules, setModules] = useState([]);
    const [selectedModules, setSelectedModules] = useState([]);
    const [visibleQuestions, setVisibleQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [errors, setErrors] = useState({});
    const [role, setRole] = useState('TI');
    const [loadingModules, setLoadingModules] = useState(false);
    const [loadingQuestions, setLoadingQuestions] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const isBusy = loadingModules || loadingQuestions || submitting;

    async function handleContinueEditing(submissionId) {
        try {
            const detail = await requestJson(
                `/pypcs/submissions/${submissionId}`,
            );

            setResumeSubmission(detail);
            setActiveMode('matrix');
        } catch (error) {
            setStatusMessage(
                `Failed to load submission for editing: ${error.message}`,
            );
        }
    }

    const sortedModules = useMemo(() => {
        return [...modules].sort((a, b) => {
            const left = Number(a.sort_order || 0);
            const right = Number(b.sort_order || 0);

            return left - right;
        });
    }, [modules]);

    useEffect(() => {
        async function loadModules() {
            setLoadingModules(true);
            setStatusMessage('');

            try {
                const result = await requestJson('/pypcs/modules');
                setModules(result.items || []);
            } catch (error) {
                setStatusMessage(
                    `Failed to load PYPCS modules: ${error.message}`,
                );
            } finally {
                setLoadingModules(false);
            }
        }

        loadModules();
    }, []);

    async function refreshVisibleQuestions(nextSelectedModules, nextRole = role) {
        if (nextSelectedModules.length === 0) {
            setVisibleQuestions([]);
            setAnswers({});
            setErrors({});
            return;
        }

        setLoadingQuestions(true);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/visible-questions', {
                method: 'POST',
                body: JSON.stringify({
                    selected_modules: nextSelectedModules,
                    role: nextRole,
                }),
            });

            const nextQuestions = result.items || [];
            setVisibleQuestions(nextQuestions);

            const visibleIds = new Set(
                nextQuestions.map((question) => question.question_id),
            );

            setAnswers((previousAnswers) => {
                const nextAnswers = {};

                Object.entries(previousAnswers).forEach(
                    ([questionId, value]) => {
                        if (visibleIds.has(questionId)) {
                            nextAnswers[questionId] = value;
                        }
                    },
                );

                return nextAnswers;
            });

            setErrors({});
        } catch (error) {
            setStatusMessage(
                `Failed to load required steps: ${error.message}`,
            );
        } finally {
            setLoadingQuestions(false);
        }
    }

    async function handleModuleToggle(moduleKey) {
        const nextSelectedModules = selectedModules.includes(moduleKey)
            ? selectedModules.filter((item) => item !== moduleKey)
            : [...selectedModules, moduleKey];

        setSelectedModules(nextSelectedModules);
        setStatusMessage('');

        await refreshVisibleQuestions(nextSelectedModules);
    }

    async function handleRoleChange(nextRole) {
        setRole(nextRole);
        setStatusMessage('');

        await refreshVisibleQuestions(selectedModules, nextRole);
    }

    function handleAnswerChange(questionId, value) {
        setAnswers((previousAnswers) => ({
            ...previousAnswers,
            value,
        }));

        setErrors((previousErrors) => {
            const nextErrors = { ...previousErrors };
            delete nextErrors[questionId];
            return nextErrors;
        });
    }

    async function handleSubmit() {
        const nextErrors = validateForm(visibleQuestions, answers);

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setStatusMessage('Please complete required fields.');
            return;
        }

        const payload = {
            selected_modules: selectedModules,
            role,
            submitted_by: 'current_user',
            product_name: answers.product_name || '',
            prodgroup3: answers.prodgroup3 || '',
            operation: answers.operation || '',
            answers,
        };

        setSubmitting(true);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/submission', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            setStatusMessage(
                `Submitted successfully. ID: ${result.submission_id || 'N/A'}`,
            );
        } catch (error) {
            const backendErrors = parseBackendValidationErrors(error.message);

            if (Object.keys(backendErrors).length > 0) {
                setErrors(backendErrors);
                setStatusMessage(
                    'Submit failed. Please complete required fields.',
                );
            } else {
                setStatusMessage(`Submit failed: ${error.message}`);
            }
        } finally {
            setSubmitting(false);
        }
    }

    function renderInput(question) {
        const questionId = question.question_id;
        const value = answers[questionId] || '';

        if (question.field_type === 'select') {
            return (
                <select
                    className="w-full rounded-md border px-3 py-2"
                    value={value}
                    onChange={(event) =>
                        handleAnswerChange(questionId, event.target.value)
                    }
                >
                    <option value="">Select...</option>
                    {(question.options || []).map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            );
        }

        if (question.field_type === 'textarea') {
            return (
                <textarea
                    className="min-h-24 w-full rounded-md border px-3 py-2"
                    value={value}
                    onChange={(event) =>
                        handleAnswerChange(questionId, event.target.value)
                    }
                />
            );
        }

        return (
            <input
                className="w-full rounded-md border px-3 py-2"
                type="text"
                value={value}
                onChange={(event) =>
                    handleAnswerChange(questionId, event.target.value)
                }
            />
        );
    }

    function renderQuestion(question) {
        const questionId = question.question_id;
        const error = errors[questionId];

        return (
            <div key={questionId} className="border-b py-4">
                <div className="mb-2">
                    <div className="font-medium">
                        {question.display_label || question.header || questionId}
                        {question.required ? (
                            <span className="ml-1 text-red-600">*</span>
                        ) : null}
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                        <span>Role: {question.role || 'N/A'}</span>

                        {question.applies_to?.length ? (
                            <span>
                                {' '}
                                | Applies to: {question.applies_to.join(', ')}
                            </span>
                        ) : null}
                    </div>

                    {question.description ? (
                        <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-muted-foreground">
                            {question.description}
                        </div>
                    ) : null}
                </div>

                {renderInput(question)}

                {error ? (
                    <div className="mt-1 text-xs text-red-600">{error}</div>
                ) : null}
            </div>
        );
    }

    function renderCreateSubmission() {
        return (
            <>
                <div className="mb-4 flex items-center gap-2">
                    <label
                        className="text-sm font-medium"
                        htmlFor="pypcs-role"
                    >
                        Role
                    </label>

                    <select
                        id="pypcs-role"
                        className="rounded-md border px-3 py-2"
                        value={role}
                        onChange={(event) =>
                            handleRoleChange(event.target.value)
                        }
                        disabled={isBusy}
                    >
                        <option value="TI">TI</option>
                        <option value="ME">ME</option>
                    </select>
                </div>

                <div className="mb-6">
                    <div className="mb-2 text-sm font-medium">Modules</div>

                    {loadingModules ? (
                        <div className="text-sm text-muted-foreground">
                            Loading modules...
                        </div>
                    ) : null}

                    {!loadingModules && sortedModules.length === 0 ? (
                        <div className="text-sm text-red-600">
                            No PYPCS modules found. Please check
                            /api/pypcs/modules.
                        </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-5">
                        {sortedModules.map((module) => {
                            const checked = selectedModules.includes(
                                module.module_key,
                            );
                            const disabled = !module.enabled_default || isBusy;

                            return (
                                <label
                                    key={module.module_key}
                                    className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${
                                        checked
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'bg-white'
                                    } ${
                                        disabled
                                            ? 'cursor-not-allowed opacity-50'
                                            : ''
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={disabled}
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
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-md border bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                            Required Steps
                        </h3>

                        {visibleQuestions.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                                {visibleQuestions.length} questions
                            </span>
                        ) : null}
                    </div>

                    {loadingQuestions ? (
                        <div className="text-sm text-muted-foreground">
                            Loading required steps...
                        </div>
                    ) : null}

                    {!loadingQuestions && visibleQuestions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                            Select at least one module to show required steps.
                        </div>
                    ) : null}

                    {visibleQuestions.map((question) =>
                        renderQuestion(question),
                    )}

                    {visibleQuestions.length > 0 ? (
                        <div className="mt-4">
                            <button
                                type="button"
                                className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                                onClick={handleSubmit}
                                disabled={isBusy}
                            >
                                {submitting ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    ) : null}

                    {statusMessage ? (
                        <div className="mt-3 whitespace-pre-wrap text-sm">
                            {statusMessage}
                        </div>
                    ) : null}
                </div>
            </>
        );
    }

    return (
        <div className="h-[calc(100vh-80px)] overflow-y-auto p-4 pb-10">
            <div className="mb-4">
                <h2 className="text-xl font-semibold">PYPCS Quality Matrix</h2>
                <p className="text-sm text-muted-foreground">
                    Select modules to enable required questions or review
                    submitted events.
                </p>
            </div>

            <div className="mb-4 flex gap-2">
                <button
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm ${
                        activeMode === 'matrix'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white'
                    }`}
                    onClick={() => setActiveMode('matrix')}
                >
                    Matrix Submission
                </button>

                <button
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm ${
                        activeMode === 'review'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white'
                    }`}
                    onClick={() => setActiveMode('review')}
                >
                    Review Submissions
                </button>
            </div>

            {activeMode === 'review' ? (
                <PYPCSSubmissionsReview
                    onContinueEditing={handleContinueEditing}
                />
            ) : activeMode === 'matrix' ? (
                <PYPCSMatrixSubmission
                    resumeSubmission={resumeSubmission}
                    onResumeHandled={() => setResumeSubmission(null)}
                />
            ) : (
                renderCreateSubmission()
            )}
        </div>
    );
}