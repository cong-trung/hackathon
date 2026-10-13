import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChevronsUpDown, Info, X } from 'lucide-react';

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
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/shared/components/ui/popover';
import { scrollbarClassName } from '@/shared/utils/scrollbar';

const API_BASE = '/api';
const MIN_TP_NAME_LENGTH = 7;
const numberColumn = { width: 48, minWidth: 48, maxWidth: 48, left: 0 };
const labelColumn = { width: 256, minWidth: 256, maxWidth: 256, left: 48 };

// Editing the first selected module's answer auto-fills the rest of the row.
const AUTO_FILL_FROM_FIRST_QUESTION_IDS = new Set(['nsb']);

// Shared answers expand to every applicable selected module on save.
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
        const error = new Error(text || response.statusText);
        error.status = response.status;
        try {
            error.detail = JSON.parse(text)?.detail;
        } catch {
            error.detail = undefined;
        }
        throw error;
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
        && question.applies_to.some(
            (key) => key.toUpperCase() === moduleKey.toUpperCase(),
        );
}

function getFirstAnswerForQuestion(question, selectedModules, cells) {
    for (const moduleKey of selectedModules) {
        if (!isQuestionApplicableToModule(question, moduleKey)) {
            continue;
        }

        const value = cells[getCellKey(question.question_id, moduleKey)];
        if (value && String(value).trim() !== '') {
            return value;
        }
    }

    return '';
}

function expandMatrixCells(questions, selectedModules, cells) {
    const expanded = { ...cells };

    questions.forEach((question) => {
        const shared = SHARED_ACROSS_MODULES_QUESTION_IDS.has(question.question_id);
        const autoFill = AUTO_FILL_FROM_FIRST_QUESTION_IDS.has(question.question_id);

        if (!shared && !autoFill) {
            return;
        }

        const value = shared
            ? getFirstAnswerForQuestion(question, selectedModules, cells)
            : cells[getCellKey(question.question_id, selectedModules[0])] || '';

        selectedModules.forEach((moduleKey) => {
            if (!isQuestionApplicableToModule(question, moduleKey)) {
                return;
            }

            const cellKey = getCellKey(question.question_id, moduleKey);
            if (shared || (value && !expanded[cellKey])) {
                expanded[cellKey] = value;
            }
        });
    });

    return expanded;
}

function OperationInput({ options, value, onChange, label, errorId, invalid }) {
    const values = value ? value.split('|') : [];
    const known = values.filter((item) => item !== 'Other' && options.includes(item));
    const unknown = values.filter((item) => item !== 'Other' && !options.includes(item));
    const hasOther = values.includes('Other') || unknown.length > 0;
    const [otherText, setOtherText] = useState(unknown[0] || '');
    const [search, setSearch] = useState('');
    const matches = options.filter((option) =>
        option.toLowerCase().includes(search.trim().toLowerCase()),
    );

    function toggle(option) {
        if (option === 'Other') {
            if (hasOther) {
                setOtherText('');
                onChange(known.join('|'));
            } else {
                onChange([...values, otherText.trim() || 'Other'].join('|'));
            }
            return;
        }

        onChange((values.includes(option)
            ? values.filter((item) => item !== option)
            : [...values, option]).join('|'));
    }

    function changeOther(text) {
        const additional = unknown[0] === otherText.trim() ? unknown.slice(1) : unknown;
        setOtherText(text);
        onChange([...known, text.trim() || 'Other', ...additional].join('|'));
    }

    return (
        <div className="min-w-0 space-y-1">
            <Popover onOpenChange={() => setSearch('')}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-label={label}
                        aria-invalid={invalid || undefined}
                        aria-describedby={errorId}
                        className="w-full justify-between font-normal"
                    >
                        <span className="truncate">
                            {known.length + unknown.length
                                ? `${known.length + unknown.length} selected`
                                : 'Select operations'}
                        </span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command filter={(option, query) =>
                        option.toLowerCase().includes(query.toLowerCase()) ? 1 : 0
                    }>
                        <CommandInput
                            placeholder="Search operations"
                            value={search}
                            onValueChange={setSearch}
                        />
                        <CommandList>
                            <CommandEmpty>No operations found.</CommandEmpty>
                            <CommandGroup>
                                {matches.slice(0, 200).map((option) => (
                                    <CommandItem key={option} value={option} onSelect={() => toggle(option)}>
                                        <Checkbox
                                            checked={option === 'Other' ? hasOther : values.includes(option)}
                                            tabIndex={-1}
                                            className="pointer-events-none mr-2"
                                        />
                                        {option}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                            {matches.length > 200 ? (
                                <div className="p-2 text-xs text-muted-foreground">
                                    Refine your search to see more operations.
                                </div>
                            ) : null}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {hasOther ? (
                <input
                    className="w-full rounded border px-2 py-1 text-sm"
                    type="text"
                    aria-label={`Specify other operation for ${label}`}
                    aria-invalid={invalid || undefined}
                    aria-describedby={errorId}
                    placeholder="Please specify other operation"
                    value={otherText}
                    onChange={(event) => changeOther(event.target.value.replaceAll('|', ''))}
                    maxLength={100}
                />
            ) : null}
            {values.filter((item) => item && item !== 'Other').length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {values.map((item, index) => item && item !== 'Other' ? (
                        <span key={`${item}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded border bg-white px-1 text-xs">
                            <span className="truncate" title={item}>{item}</span>
                            <button
                                type="button"
                                aria-label={`Remove ${item}`}
                                title={`Remove ${item}`}
                                className="focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => {
                                    if (item === unknown[0] && hasOther) setOtherText(unknown[1] || '');
                                    onChange(values.filter((_, itemIndex) => itemIndex !== index).join('|'));
                                }}
                            >
                                <X className="size-3" />
                            </button>
                        </span>
                    ) : null)}
                </div>
            ) : null}
        </div>
    );
}

export default function PYPCSMatrixSubmission({
    resumeSubmission = null,
    onResumeHandled = () => {},
    modeSwitch,
} = {}) {
    const [modules, setModules] = useState([]);
    const [selectedModules, setSelectedModules] = useState([]);
    const [role, setRole] = useState('TI');
    const [questions, setQuestions] = useState([]);
    const [cells, setCells] = useState({});
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [statusKind, setStatusKind] = useState('success');
    const [moduleLoadError, setModuleLoadError] = useState(false);
    const instanceId = useId();
    const [submissionId, setSubmissionId] = useState(null);
    const [submissionStatus, setSubmissionStatus] = useState(null);
    const [versions, setVersions] = useState({});
    const [conflict, setConflict] = useState(null);
    const [editingDescriptionId, setEditingDescriptionId] = useState(null);
    const [descriptionDrafts, setDescriptionDrafts] = useState({});
    const [modulesOpen, setModulesOpen] = useState(false);

    const sortedModules = useMemo(() => {
        return [...modules].sort((a, b) => {
            return Number(a.sort_order || 0) - Number(b.sort_order || 0);
        });
    }, [modules]);
    const selectedModuleDetails = sortedModules.filter((module) =>
        selectedModules.includes(module.module_key),
    );
    const sharedQuestions = questions.filter((question) =>
        SHARED_ACROSS_MODULES_QUESTION_IDS.has(question.question_id),
    );
    const tableQuestions = questions.filter((question) =>
        !SHARED_ACROSS_MODULES_QUESTION_IDS.has(question.question_id),
    );

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
        setVersions({});
        setConflict(null);
        setStatusMessage('');
    }

    const loadModules = useCallback(async () => {
        setLoading(true);
        setModuleLoadError(false);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/modules');
            setModules(result.items || []);
            const availableModules = (result.items || [])
                .filter((module) => module.enabled_default)
                .map((module) => module.module_key);
            if (availableModules.length) {
                const preview = await requestJson('/pypcs/visible-questions', {
                    method: 'POST',
                    body: JSON.stringify({
                        selected_modules: availableModules,
                        role: 'TI',
                    }),
                });
                setQuestions((previous) => previous.length ? previous : preview.items || []);
            }
        } catch (error) {
            setStatusKind('error');
            setModuleLoadError(true);
            setStatusMessage(`Failed to load modules: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadModules();
    }, [loadModules]);

    async function refreshQuestions(nextSelectedModules, nextRole = role) {
        if (nextSelectedModules.length === 0) {
            setCells({});
            setErrors({});
            if (!modules.some((module) => module.enabled_default)) {
                setQuestions([]);
                return true;
            }
        }

        setLoading(true);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/visible-questions', {
                method: 'POST',
                body: JSON.stringify({
                    selected_modules: nextSelectedModules.length
                        ? nextSelectedModules
                        : modules.filter((module) => module.enabled_default)
                            .map((module) => module.module_key),
                    role: backendRole(nextRole),
                }),
            });

            setQuestions(result.items || []);
            setCells((previousCells) => expandMatrixCells(
                result.items || [], nextSelectedModules, previousCells,
            ));
            setErrors({});
            return true;
        } catch (error) {
            setStatusKind('error');
            setStatusMessage(`Failed to load matrix: ${error.message}`);
            return false;
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
        setVersions(sub.versions || {});
        setConflict(null);
        setStatusMessage('');

        refreshQuestions(nextModules, nextRole);
        onResumeHandled();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeSubmission]);

    async function handleModuleToggle(moduleKey) {
        const addingModule = !selectedModules.includes(moduleKey);
        const nextSelectedModules = selectedModules.includes(moduleKey)
            ? selectedModules.filter((item) => item !== moduleKey)
            : [...selectedModules, moduleKey];

        if (addingModule) {
            setCells((previousCells) => expandMatrixCells(
                questions, nextSelectedModules, previousCells,
            ));
        }

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
            setStatusKind('error');
            setStatusMessage(`Failed to save description: ${error.message}`);
        } finally {
            setLoading(false);
        }
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
        const expandedCells = expandMatrixCells(questions, selectedModules, cells);

        questions.forEach((question) => {
            if (!question.required || question.question_id === 'operation') {
                return;
            }

            const hasAnswer = selectedModules.some((moduleKey) => {
                if (!isQuestionApplicableToModule(question, moduleKey)) {
                    return false;
                }

                const cellKey = getCellKey(question.question_id, moduleKey);
                const value = expandedCells[cellKey];

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

    function validateOperations(requireAll) {
        const nextErrors = {};
        const question = questions.find((item) => item.question_id === 'operation');
        if (!question) return nextErrors;

        selectedModules.forEach((moduleKey) => {
            if (!isQuestionApplicableToModule(question, moduleKey)) return;
            const cellKey = getCellKey('operation', moduleKey);
            const answer = cells[cellKey] || '';
            const options = question.options_by_module?.[moduleKey] || question.options || [];
            const parts = answer ? answer.split('|') : [];

            if (!parts.length) {
                if (requireAll && question.required) nextErrors[cellKey] = 'Operation is required';
            } else if (parts.some((part) => {
                const trimmed = part.trim();
                return !trimmed || trimmed === 'Other' || (trimmed !== part)
                    || (!options.includes(trimmed)
                        && (!options.includes('Other') || trimmed.length > 100));
            })) {
                nextErrors[cellKey] = 'Select valid operations or specify Other (max 100 characters, no |).';
            }
        });
        return nextErrors;
    }

    function collectSubmittedCells() {
        const submittedCells = [];
        const expandedCells = expandMatrixCells(questions, selectedModules, cells);

        questions.forEach((question) => {
            selectedModules.forEach((moduleKey) => {
                if (!isQuestionApplicableToModule(question, moduleKey)) {
                    return;
                }

                if (role !== 'ALL' && question.role !== role) {
                    return;
                }

                const cellKey = getCellKey(question.question_id, moduleKey);
                const answer = expandedCells[cellKey] || '';

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

    function showSaveError(error) {
        let detail = error.detail;

        if (detail === undefined) {
            try {
                detail = JSON.parse(error.message)?.detail;
            } catch {
                detail = error.message;
            }
        }

        const missing = Array.isArray(detail?.missing_required)
            ? detail.missing_required : [];
        const invalid = Array.isArray(detail?.invalid_cells)
            ? detail.invalid_cells : [];

        if (missing.length || invalid.length) {
            const grouped = new Map();
            const cellErrors = {};

            [...missing, ...invalid].forEach((item) => {
                const module = modules.find(
                    (entry) => entry.module_key.toUpperCase()
                        === String(item.module_key).toUpperCase(),
                );
                const moduleKey = module?.module_key || item.module_key;
                const question = questions.find(
                    (entry) => entry.question_id === item.question_id,
                );
                const label = item.display_label || question?.display_label
                    || question?.header || item.question_id;
                const moduleLabel = module?.module_label || moduleKey;
                const cellKey = getCellKey(item.question_id, moduleKey);

                cellErrors[cellKey] = missing.includes(item)
                    ? `${label} is required`
                    : typeof detail.message === 'string'
                        ? detail.message : `${label} is invalid`;
                grouped.set(moduleLabel, [...(grouped.get(moduleLabel) || []), label]);
            });

            setErrors(cellErrors);
            setStatusMessage(
                <>
                    {missing.length
                        ? `Submit failed - ${missing.length} required cells are missing:`
                        : typeof detail.message === 'string'
                            ? detail.message : 'Matrix save failed. Please fix invalid cells.'}
                    <ul className="list-disc pl-5">
                        {[...grouped].map(([moduleLabel, labels]) => (
                            <li key={moduleLabel}>
                                {moduleLabel}: {labels.join(', ')}
                            </li>
                        ))}
                    </ul>
                </>,
            );
            return;
        }

        setStatusMessage(
            `Matrix save failed: ${typeof detail === 'string' && detail
                && !detail.startsWith('<') && !detail.startsWith('{')
                ? detail === 'Failed to fetch'
                    ? 'Unable to reach the server. Please try again.'
                    : detail
                : typeof detail?.message === 'string'
                    ? detail.message : 'Please try again.'}`,
        );
    }

    async function saveMatrix(nextStatus) {
        const tpNameErrors = validateTpNameLength();
        const requiredErrors =
            nextStatus === 'final' ? validateMatrix() : {};
        const nextErrors = { ...requiredErrors, ...validateOperations(nextStatus === 'final'), ...tpNameErrors };

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setStatusKind('error');
            setStatusMessage(
                Object.keys(tpNameErrors).length > 0
                    ? 'Please fix invalid matrix cells.'
                    : 'Please complete required matrix cells.',
            );
            return;
        }

        const expandedCells = expandMatrixCells(questions, selectedModules, cells);
        const hasProductName = selectedModules.some((moduleKey) => {
            const value = expandedCells[getCellKey('product_name', moduleKey)];
            return value && String(value).trim() !== '';
        });

        if (!hasProductName) {
            setStatusKind('error');
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
            ...(submissionId && versions[role]
                ? { expected_version: versions[role] } : {}),
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
            setVersions(result.versions || {});
            setStatusKind('success');
            setStatusMessage(
                nextStatus === 'draft'
                    ? `Saved as draft. ID: ${result.submission_id || 'N/A'}`
                    : `Matrix submitted successfully. ID: ${result.submission_id || 'N/A'}`,
            );
        } catch (error) {
            setStatusKind('error');
            if (error.status === 409 && error.detail?.code === 'conflict') {
                setConflict(error.detail);
            } else {
                showSaveError(error);
            }
        } finally {
            setLoading(false);
        }
    }

    async function reloadLatest() {
        setLoading(true);
        try {
            const detail = await requestJson(`/pypcs/submissions/${submissionId}`);
            const sub = detail.submission;
            const nextModules = sub.selected_modules || [];
            const nextRole = sub.role ? sub.role.toUpperCase() : 'ALL';
            const nextCells = {};
            (detail.cells || []).forEach((cell) => {
                nextCells[getCellKey(cell.question_id, cell.module_key)] = cell.answer || '';
            });
            if (!await refreshQuestions(nextModules, nextRole)) return;
            setSelectedModules(nextModules);
            setRole(nextRole);
            setSubmissionStatus(sub.status || 'final');
            setVersions(sub.versions || {});
            setCells(nextCells);
            setErrors({});
            setConflict(null);
            setStatusMessage('');
        } catch (error) {
            setStatusKind('error');
            setStatusMessage(`Failed to reload submission: ${error.message}`);
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

    function renderFieldInput(question, value, onChange, label, errorId, inputKey, disabled = false, inputId) {
        const options = question.options || [];
        const invalid = Boolean(errorId);
        const hasOtherOption = options.includes('Other');
        const isOtherSelected =
            hasOtherOption
            && value !== ''
            && (value === 'Other' || !options.includes(value));

        if (question.question_id === 'operation') {
            return <OperationInput key={inputKey} options={options} value={value} onChange={onChange}
                label={label} errorId={errorId} invalid={invalid} />;
        }

        if (question.field_type === 'select') {
            return (
                <>
                    <select
                        className="w-full rounded border px-2 py-1 text-sm"
                        id={inputId}
                        disabled={disabled}
                        aria-label={label}
                        aria-invalid={invalid || undefined}
                        aria-describedby={errorId}
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
                            disabled={disabled}
                            aria-label={`Specify other value for ${label}`}
                            aria-invalid={invalid || undefined}
                            aria-describedby={errorId}
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
                    id={inputId}
                    disabled={disabled}
                    aria-label={label}
                    aria-invalid={invalid || undefined}
                    aria-describedby={errorId}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
            );
        }

        return (
            <input
                className="w-full rounded border px-2 py-1 text-sm"
                type="text"
                id={inputId}
                disabled={disabled}
                aria-label={label}
                aria-invalid={invalid || undefined}
                aria-describedby={errorId}
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
        const errorId = error ? `${instanceId}-${cellKey}-error` : undefined;
        const label = `${question.display_label || question.header || question.question_id} - ${module.module_label || moduleKey}`;

        if (!selected || !applicable) {
            return (
                <td
                    key={moduleKey}
                    className="min-w-32 border bg-muted p-2 text-center text-xs text-muted-foreground"
                >
                    {!selected ? 'Disabled' : 'N/A'}
                </td>
            );
        }

        if (!editable) {
            return (
                <td
                    key={moduleKey}
                    className="min-w-32 border bg-muted p-2 text-xs text-muted-foreground"
                >
                    Read only
                </td>
            );
        }

        const cellQuestion = question.options_by_module?.[moduleKey]
            ? { ...question, options: question.options_by_module[moduleKey] }
            : question;

        return (
            <td key={moduleKey} className="min-w-40 border-b border-r bg-background p-2">
                {renderFieldInput(
                    cellQuestion,
                    value,
                    (nextValue) => handleCellChange(question.question_id, moduleKey, nextValue),
                    label,
                    errorId,
                    `${submissionId || 'new'}-${cellKey}`,
                )}

                {error ? (
                    <div id={errorId} className="mt-1 text-xs text-destructive">{error}</div>
                ) : null}
            </td>
        );
    }

    function renderSharedField(question) {
        const applicableModules = selectedModules.filter((moduleKey) =>
            isQuestionApplicableToModule(question, moduleKey),
        );
        const value = getFirstAnswerForQuestion(question, selectedModules, cells);
        const cellKey = getCellKey(question.question_id, applicableModules[0] || 'shared');
        const error = applicableModules.map((moduleKey) => errors[getCellKey(question.question_id, moduleKey)]).find(Boolean);
        const errorId = error ? `${instanceId}-${cellKey}-error` : undefined;
        const label = question.display_label || question.header || question.question_id;
        const inputId = `${instanceId}-${question.question_id}`;

        return (
            <div key={question.question_id} className="min-w-0 space-y-1">
                <div className="flex items-center gap-1">
                    <label htmlFor={inputId} className="min-w-0 break-words text-xs font-medium">
                        {label}{question.required ? <span className="ml-1 text-destructive">*</span> : null}
                    </label>
                    {renderDescription(question)}
                </div>
                {renderFieldInput(
                    question, value,
                    (nextValue) => handleSharedFieldChange(question, nextValue),
                    label, errorId, undefined, !applicableModules.length, inputId,
                )}
                {error ? (
                    <div id={errorId} className="mt-1 text-xs text-destructive">{error}</div>
                ) : null}
            </div>
        );
    }

    function renderDescription(question, inverse = false) {
        const label = question.display_label || question.header || question.question_id;
        const hasDescription = Boolean(question.description?.trim());

        return (
            <Popover onOpenChange={(open) => {
                if (!open && editingDescriptionId === question.question_id) {
                    setEditingDescriptionId(null);
                }
            }}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${hasDescription ? 'Description' : 'Add description'} for ${label}`}
                        title={`${hasDescription ? 'Description' : 'Add description'} for ${label}`}
                        className={`shrink-0 rounded-sm p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${inverse ? 'text-white' : 'text-muted-foreground'}`}
                    >
                        <Info
                            aria-hidden="true"
                            className={`size-4 ${hasDescription ? inverse ? 'fill-white text-primary' : 'fill-foreground text-background' : ''}`}
                        />
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] space-y-2 text-sm" align="start">
                    {editingDescriptionId === question.question_id ? (
                        <>
                            <label htmlFor={`${instanceId}-${question.question_id}-description`} className="font-medium">
                                Description for {label}
                            </label>
                            <textarea
                                id={`${instanceId}-${question.question_id}-description`}
                                className="min-h-20 w-full rounded border px-2 py-1 text-sm"
                                value={descriptionDrafts[question.question_id] ?? ''}
                                onChange={(event) => setDescriptionDrafts((previous) => ({
                                    ...previous,
                                    [question.question_id]: event.target.value,
                                }))}
                            />
                            <div className="flex gap-2">
                                <Button type="button" size="sm" onClick={() => handleSaveDescription(question.question_id)} disabled={loading}>Save</Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => setEditingDescriptionId(null)}>Cancel</Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="whitespace-pre-wrap break-words">{question.description || 'No description yet'}</p>
                            <Button type="button" size="sm" variant="outline" onClick={() => startEditingDescription(question)}>
                                {hasDescription ? 'Edit description' : 'Add description'}
                            </Button>
                        </>
                    )}
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-3 md:min-h-0 md:flex-1 md:overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <h1 className="mr-2 text-lg font-semibold">Quality Matrix</h1>
                {modeSwitch}
                <label className="ml-1 text-sm font-medium" htmlFor="matrix-role">Role</label>
                <select
                    id="matrix-role"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={role}
                    onChange={(event) => handleRoleChange(event.target.value)}
                    disabled={loading}
                >
                    <option value="TI">TI</option>
                    <option value="ME">ME</option>
                    <option value="ALL">View All (TI + ME)</option>
                </select>
                <Popover open={modulesOpen} onOpenChange={setModulesOpen}>
                    <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" aria-label={`Modules (${selectedModules.length})`} disabled={loading && !modules.length}>
                            Modules ({selectedModules.length}) <ChevronsUpDown aria-hidden="true" className="ml-2 size-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search modules" aria-label="Search modules" />
                            <CommandList>
                                <CommandEmpty>No modules found.</CommandEmpty>
                                <CommandGroup>
                                    {sortedModules.map((module) => (
                                        <CommandItem
                                            key={module.module_key}
                                            value={`${module.module_label || module.module_key} ${module.module_key}`}
                                            disabled={!module.enabled_default || loading}
                                            onSelect={() => handleModuleToggle(module.module_key)}
                                        >
                                            <Checkbox checked={selectedModules.includes(module.module_key)} tabIndex={-1} className="pointer-events-none mr-2" />
                                            {module.module_label || module.module_key}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                <div className="ml-auto flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={handleSaveDraft} disabled={loading || Boolean(conflict) || !selectedModules.length}>
                        {loading ? 'Working...' : 'Save Draft'}
                    </Button>
                    <Button type="button" size="sm" onClick={handleSubmitFinal} disabled={loading || Boolean(conflict) || !selectedModules.length}>
                        {loading ? 'Working...' : 'Submit Final'}
                    </Button>
                </div>
            </div>

            {conflict && (
                <div role="alert" className="shrink-0 rounded border border-destructive/30 p-3 text-sm text-destructive">
                    <p>{conflict.message}</p>
                    <Button type="button" size="sm" variant="outline" className="mt-2" onClick={reloadLatest} disabled={loading}>
                        {loading ? 'Reloading...' : 'Reload latest'}
                    </Button>
                </div>
            )}
            {(statusMessage || loading || moduleLoadError) ? (
                <div className="shrink-0 text-sm" role={statusKind === 'error' ? 'alert' : 'status'} aria-live="polite">
                    {statusKind === 'error' && typeof statusMessage !== 'string' ? (
                        <details className="rounded border border-destructive/30 px-2 py-1 text-destructive">
                            <summary className="cursor-pointer">Submit failed. Show details</summary>
                            <div className="mt-1">{statusMessage}</div>
                        </details>
                    ) : (
                        <span className={statusKind === 'error' ? 'text-destructive' : ''}>
                            {loading ? 'Working... ' : ''}{statusMessage}
                        </span>
                    )}
                    {moduleLoadError ? <Button type="button" size="sm" variant="outline" className="ml-2" onClick={loadModules} disabled={loading}>Retry</Button> : null}
                </div>
            ) : null}

            {submissionId ? (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border bg-muted px-3 py-1 text-sm">
                    <div className="flex items-center gap-2">
                        <span>Editing submission ID: {submissionId}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${submissionStatus === 'draft'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'}`}>
                            {submissionStatus === 'draft' ? 'Draft' : 'Final'}
                        </span>
                    </div>
                    <button type="button" className="rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring" onClick={resetForm}>
                        New Submission
                    </button>
                </div>
            ) : null}

            {sharedQuestions.length ? (
                <div className="grid shrink-0 grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
                    {sharedQuestions.map(renderSharedField)}
                </div>
            ) : null}

            <div className={`min-h-[320px] min-w-0 overflow-auto rounded-md border bg-card md:min-h-0 md:flex-1 ${scrollbarClassName}`}>
                {selectedModules.length === 0 ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
                        <p>Select one or more modules to start</p>
                        <Button type="button" variant="outline" onClick={() => setModulesOpen(true)} disabled={!modules.length}>Select modules</Button>
                    </div>
                ) : (
                <table style={{ minWidth: 48 + 256 + 64 + selectedModuleDetails.length * 160 }}
                    className="w-full table-fixed border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr className="bg-table-header text-table-header-foreground">
                            <th style={numberColumn} className="sticky top-0 z-30 border-b border-r bg-table-header p-2">
                                No
                            </th>
                            <th style={labelColumn} className="sticky top-0 z-30 border-b-2 border-r-2 bg-table-header py-2 pl-2 pr-3 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                                Header
                            </th>
                            <th className="sticky top-0 z-20 w-16 border-b border-r bg-table-header p-2">
                                Role
                            </th>

                            {selectedModuleDetails.map((module) => (
                                <th
                                    key={module.module_key}
                                    scope="col"
                                    className="sticky top-0 z-20 w-40 border-b border-r bg-table-header p-2"
                                >
                                    {module.module_label || module.module_key}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {tableQuestions.length === 0 ? (
                            <tr>
                                <td
                                    className="border p-3 text-muted-foreground"
                                    colSpan={3 + selectedModuleDetails.length}
                                >
                                    No matrix rows found.
                                </td>
                            </tr>
                        ) : null}

                        {tableQuestions.map((question, index) => (
                            <tr key={question.question_id} className="group even:bg-table-stripe hover:bg-table-hover">
                                <td style={numberColumn} className="sticky z-10 border-b border-r bg-table-frozen p-2 text-center group-hover:bg-table-hover">
                                    {index + 1}
                                </td>

                                <th scope="row" style={labelColumn} className="sticky z-10 border-b-2 border-r-2 bg-primary py-2 pl-2 pr-3 text-left align-top font-medium text-primary-foreground shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] [overflow-wrap:anywhere]">
                                    <span className="flex items-start gap-1">
                                        <span className="min-w-0 flex-1">
                                            {question.display_label || question.header || question.question_id}
                                            {question.required ? <span className="ml-1">*</span> : null}
                                        </span>
                                        {renderDescription(question, true)}
                                    </span>
                                </th>

                                <td className="border p-2 text-center font-medium">
                                    {question.role}
                                </td>

                                {selectedModuleDetails.map((module) => renderCell(question, module))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                )}
            </div>
        </div>
    );
}