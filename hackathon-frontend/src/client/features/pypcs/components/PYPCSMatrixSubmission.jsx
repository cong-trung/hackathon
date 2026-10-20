import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, CopyCheck, Info, X } from 'lucide-react';

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
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
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const numberColumn = { width: 48, minWidth: 48, maxWidth: 48, left: 0 };
const labelColumn = { width: 256, minWidth: 256, maxWidth: 256, left: 48 };

// Shared answers expand to every applicable selected module on save.
const SHARED_ACROSS_MODULES_QUESTION_IDS = new Set([
    'product_name',
    'implementation_stage',
    'xvi_tool_type',
    'fab_technology',
    'segment',
    'lts_ball',
    'nsb',
    'nsb_comment',
    'foveros',
    'mcp',
]);
const APPLY_TO_ALL_QUESTION_IDS = new Set([
    'prodgroup3', 'backend_test_process_flow', 'package', 'bare_die_lid',
]);

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
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

function formSnapshot(selectedModules, role, cells) {
    return JSON.stringify({
        selectedModules,
        role,
        cells: Object.fromEntries(Object.entries(cells)
            .filter(([, value]) => String(value || '').trim())
            .sort(([left], [right]) => left.localeCompare(right))),
    });
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
        if (!shared) {
            return;
        }

        const value = getFirstAnswerForQuestion(question, selectedModules, cells);

        selectedModules.forEach((moduleKey) => {
            if (!isQuestionApplicableToModule(question, moduleKey)) {
                return;
            }

            const cellKey = getCellKey(question.question_id, moduleKey);
            expanded[cellKey] = value;
        });
    });

    return expanded;
}

function OperationInput({ options, value, onChange, label, errorId, invalid, disabled }) {
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
                        disabled={disabled}
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
                    disabled={disabled}
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
                                disabled={disabled}
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
    onDirtyChange = () => {},
} = {}) {
    const [modules, setModules] = useState([]);
    const [selectedModules, setSelectedModules] = useState([]);
    const [visibleModules, setVisibleModules] = useState([]);
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
    const [applicableOpen, setApplicableOpen] = useState(false);
    const [pendingRemove, setPendingRemove] = useState(null);
    const [pendingApply, setPendingApply] = useState(null);
    const [editPin, setEditPin] = useState('');
    const [pinDraft, setPinDraft] = useState('');
    const [editReason, setEditReason] = useState('');
    const [pinError, setPinError] = useState('');
    const [pinOpen, setPinOpen] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [missingIndex, setMissingIndex] = useState(-1);
    const [pulseKey, setPulseKey] = useState(null);
    const baseline = useRef(formSnapshot([], 'TI', {}));
    const tableRef = useRef(null);
    const fieldRefs = useRef(new Map());

    const sortedModules = useMemo(() => {
        return [...modules].sort((a, b) => {
            return Number(a.sort_order || 0) - Number(b.sort_order || 0);
        });
    }, [modules]);
    const selectedModuleDetails = sortedModules.filter((module) =>
        visibleModules.includes(module.module_key),
    );
    const locked = submissionStatus === 'final' && !editPin;
    const nsbQuestion = questions.find((question) => question.question_id === 'nsb');
    const showNsbReason = nsbQuestion && String(getFirstAnswerForQuestion(
        nsbQuestion, selectedModules, cells,
    )).trim().toUpperCase() === 'Y';
    const sharedQuestions = questions.filter((question) =>
        SHARED_ACROSS_MODULES_QUESTION_IDS.has(question.question_id)
        && (question.question_id !== 'nsb_comment' || showNsbReason),
    );
    const tableQuestions = questions.filter((question) =>
        !SHARED_ACROSS_MODULES_QUESTION_IDS.has(question.question_id),
    );
    const expanded = expandMatrixCells(questions, selectedModules, cells);
    const isRequired = (question, moduleKey) =>
        selectedModules.includes(moduleKey)
        && isQuestionApplicableToModule(question, moduleKey)
        && (role === 'ALL' || question.role === role)
        && (question.required || (question.question_id === 'nsb_comment'
            && String(expanded[getCellKey('nsb', moduleKey)] || '')
                .trim().toUpperCase() === 'Y'));
    const missingKeys = [
        ...sharedQuestions.flatMap((question) => selectedModules
            .filter((key) => isRequired(question, key)
                && !String(expanded[getCellKey(question.question_id, key)] || '').trim())
            .map((key) => getCellKey(question.question_id, key))),
        ...tableQuestions.flatMap((question) => sortedModules
            .filter((module) => isRequired(question, module.module_key)
                && !String(expanded[getCellKey(question.question_id, module.module_key)] || '').trim())
            .map((module) => getCellKey(question.question_id, module.module_key))),
    ];
    const hiddenApplicable = selectedModules.filter((key) => !visibleModules.includes(key));
    const currentSnapshot = formSnapshot(selectedModules, role, cells);

    useEffect(() => {
        if (baseline.current !== null) {
            onDirtyChange(currentSnapshot !== baseline.current);
        }
    }, [currentSnapshot, onDirtyChange]);

    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    function nextMissing() {
        if (!missingKeys.length) return;
        const next = (missingIndex + 1) % missingKeys.length;
        const key = missingKeys[next];
        const moduleKey = key.slice(key.lastIndexOf('__') + 2);
        setMissingIndex(next);
        if (!SHARED_ACROSS_MODULES_QUESTION_IDS.has(key.split('__')[0])) {
            setVisibleModules((previous) => [...new Set([...previous, moduleKey])]);
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const target = fieldRefs.current.get(key);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            target?.querySelector('input, select, textarea, button')?.focus();
            setPulseKey(key);
        }));
    }

    useEffect(() => {
        if (!pulseKey) return undefined;
        const timer = setTimeout(() => setPulseKey(null), 1200);
        return () => clearTimeout(timer);
    }, [pulseKey]);

    async function verifyPin(event) {
        event.preventDefault();
        setVerifying(true);
        setPinError('');
        try {
            await requestJson(`/pypcs/submissions/${submissionId}/verify-edit-pin`, {
                method: 'POST',
                body: JSON.stringify({ pin: pinDraft }),
            });
            setEditPin(pinDraft);
            setPinDraft('');
            setPinOpen(false);
        } catch (error) {
            setPinError(error.status === 429
                ? 'Too many attempts. Try again in a few minutes.'
                : error.status === 403 ? 'Incorrect PIN'
                    : error.detail?.message || 'Unable to verify PIN.');
        } finally {
            setVerifying(false);
        }
    }

    function backendRole(currentRole) {
        return currentRole === 'ALL' ? null : currentRole;
    }

    function resetForm() {
        setSelectedModules([]);
        setVisibleModules([]);
        setRole('TI');
        setQuestions([]);
        setCells({});
        setErrors({});
        setSubmissionId(null);
        setSubmissionStatus(null);
        setVersions({});
        setConflict(null);
        setStatusMessage('');
        setPendingApply(null);
        setEditPin('');
        setEditReason('');
        baseline.current = formSnapshot([], 'TI', {});
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
        setVisibleModules(nextModules);
        setRole(nextRole);
        setCells(nextCells);
        baseline.current = formSnapshot(nextModules, nextRole, nextCells);
        setEditPin('');
        setEditReason('');
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

    async function changeApplicable(moduleKey, removing = false) {
        const next = removing
            ? selectedModules.filter((key) => key !== moduleKey)
            : [...selectedModules, moduleKey];
        if (removing) {
            setCells((previous) => Object.fromEntries(Object.entries(previous)
                .filter(([key]) => !key.endsWith(`__${moduleKey}`))));
            setErrors((previous) => Object.fromEntries(Object.entries(previous)
                .filter(([key]) => !key.endsWith(`__${moduleKey}`))));
        } else {
            setVisibleModules((previous) => [...new Set([...previous, moduleKey])]);
        }
        setSelectedModules(next);
        setPendingRemove(null);
        await refreshQuestions(next);
    }

    function handleModuleToggle(moduleKey) {
        if (!selectedModules.includes(moduleKey)) {
            changeApplicable(moduleKey);
            return;
        }
        const count = Object.entries(cells).filter(([key, value]) =>
            key.endsWith(`__${moduleKey}`) && String(value || '').trim()).length;
        if (count) setPendingRemove({ moduleKey, count });
        else changeApplicable(moduleKey, true);
    }

    async function handleRoleChange(nextRole) {
        setRole(nextRole);
        await refreshQuestions(selectedModules, nextRole);
    }

    function handleCellChange(questionId, moduleKey, value) {
        const cellKey = getCellKey(questionId, moduleKey);
        setCells((previousCells) => ({ ...previousCells, [cellKey]: value }));

        setErrors((previousErrors) => {
            const nextErrors = { ...previousErrors };
            delete nextErrors[cellKey];

            return nextErrors;
        });
    }

    function handleSharedFieldChange(question, value) {
        const clearReason = question.question_id === 'nsb' && value.trim().toUpperCase() !== 'Y';
        setCells((previousCells) => {
            const nextCells = { ...previousCells };

            selectedModules.forEach((moduleKey) => {
                if (!isQuestionApplicableToModule(question, moduleKey)) {
                    return;
                }

                nextCells[getCellKey(question.question_id, moduleKey)] = value;
            });

            if (clearReason) {
                Object.keys(nextCells).forEach((cellKey) => {
                    if (cellKey.startsWith('nsb_comment__')) nextCells[cellKey] = '';
                });
            }

            return nextCells;
        });

        setErrors((previousErrors) => {
            const nextErrors = { ...previousErrors };

            selectedModules.forEach((moduleKey) => {
                delete nextErrors[getCellKey(question.question_id, moduleKey)];
            });

            if (clearReason) {
                Object.keys(nextErrors).forEach((cellKey) => {
                    if (cellKey.startsWith('nsb_comment__')) delete nextErrors[cellKey];
                });
            }

            return nextErrors;
        });
    }

    function applyTargets(question) {
        const applicable = selectedModuleDetails.filter((module) =>
            isQuestionApplicableToModule(question, module.module_key)
            && (role === 'ALL' || question.role === role)
            && (question.question_id !== 'backend_test_process_flow'
                || module.module_key.toUpperCase().startsWith('HDMX')),
        );
        const source = applicable.find((module) =>
            String(cells[getCellKey(question.question_id, module.module_key)] || '').trim(),
        );
        return { source, targets: source
            ? applicable.filter((module) => module.module_key !== source.module_key)
            : [] };
    }

    function commitApply(question, source, targets) {
        const value = cells[getCellKey(question.question_id, source.module_key)];
        setCells((previous) => {
            const next = { ...previous };
            targets.forEach((module) => {
                next[getCellKey(question.question_id, module.module_key)] = value;
            });
            return next;
        });
        setErrors((previous) => {
            const next = { ...previous };
            targets.forEach((module) => {
                delete next[getCellKey(question.question_id, module.module_key)];
            });
            delete next[getCellKey(question.question_id, source.module_key)];
            return next;
        });
        setStatusKind('success');
        setStatusMessage(`${question.display_label || question.header || question.question_id} applied to ${targets.length} modules`);
        setPendingApply(null);
    }

    function handleApply(question) {
        const { source, targets } = applyTargets(question);
        if (!source || !targets.length) return;
        const value = cells[getCellKey(question.question_id, source.module_key)];
        const overwriteCount = targets.filter((module) => {
            const existing = cells[getCellKey(question.question_id, module.module_key)];
            return String(existing || '').trim() && existing !== value;
        }).length;
        if (overwriteCount) {
            setPendingApply({ question, source, targets, overwriteCount });
        } else {
            commitApply(question, source, targets);
        }
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
        questions.forEach((question) => {
            selectedModules.forEach((moduleKey) => {
                const cellKey = getCellKey(question.question_id, moduleKey);
                if (isRequired(question, moduleKey) && !String(expanded[cellKey] || '').trim()) {
                    nextErrors[cellKey] = `${question.display_label || question.header || question.question_id} is required`;
                }
            });
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

    function validateEmails() {
        const nextErrors = {};
        selectedModules.forEach((moduleKey) => {
            const key = getCellKey('pdo_owner', moduleKey);
            const value = String(cells[key] || '').trim();
            if (value && !EMAIL_PATTERN.test(value)) {
                nextErrors[key] = 'Invalid PdO owner email.';
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
        if (locked) return;
        const tpNameErrors = validateTpNameLength();
        const requiredErrors =
            nextStatus === 'final' ? validateMatrix() : {};
        const emailErrors = validateEmails();
        const nextErrors = { ...requiredErrors, ...validateOperations(nextStatus === 'final'), ...tpNameErrors, ...emailErrors };

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setStatusKind('error');
            setStatusMessage(
                Object.keys(tpNameErrors).length > 0 || Object.keys(emailErrors).length > 0
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
            ...(submissionStatus === 'final' ? { edit_reason: editReason } : {}),
            ...(submissionId && versions[role]
                ? { expected_version: versions[role] } : {}),
        };

        setLoading(true);
        setStatusMessage('');

        try {
            const result = await requestJson('/pypcs/matrix-submission', {
                method: 'POST',
                headers: editPin ? { 'X-Edit-Pin': editPin } : {},
                body: JSON.stringify(payload),
            });

            setSubmissionId(result.submission_id || null);
            setSubmissionStatus(result.status || nextStatus);
            setVersions(result.versions || {});
            baseline.current = currentSnapshot;
            onDirtyChange(false);
            setEditPin('');
            setEditReason('');
            setStatusKind('success');
            setStatusMessage(
                nextStatus === 'draft'
                    ? `Saved as draft. ID: ${result.submission_id || 'N/A'}`
                    : `Matrix submitted successfully. ID: ${result.submission_id || 'N/A'}`,
            );
        } catch (error) {
            setStatusKind('error');
            if (error.status === 423) {
                setEditPin('');
                setEditReason('');
                setStatusMessage(error.detail?.code === 'final_edit_disabled'
                    ? 'Editing final submissions is disabled on this server'
                    : error.detail?.message || 'Final submission is locked.');
            } else if (error.status === 409 && error.detail?.code === 'conflict') {
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
            setVisibleModules(nextModules);
            setRole(nextRole);
            setSubmissionStatus(sub.status || 'final');
            setVersions(sub.versions || {});
            setCells(nextCells);
            baseline.current = formSnapshot(nextModules, nextRole, nextCells);
            onDirtyChange(false);
            setEditPin('');
            setEditReason('');
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
                label={label} errorId={errorId} invalid={invalid} disabled={disabled} />;
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
                    placeholder={question.question_id === 'nsb_comment' ? 'Explain why this is Non-Synergy-Build' : undefined}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
            );
        }

        return (
            <input
                className="w-full rounded border px-2 py-1 text-sm"
                type={question.question_id === 'pdo_owner' ? 'email' : 'text'}
                id={inputId}
                disabled={disabled}
                aria-label={label}
                aria-invalid={invalid || undefined}
                aria-describedby={errorId}
                placeholder={question.question_id === 'pdo_owner' ? 'name@intel.com'
                    : question.question_id === 'nsb_comment' ? 'Explain why this is Non-Synergy-Build' : undefined}
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
        const missing = isRequired(question, moduleKey) && !String(value).trim();
        const label = `${question.display_label || question.header || question.question_id} - ${module.module_label || moduleKey}`;

        if (!selected || !applicable) {
            return (
                <td
                    key={moduleKey}
                    className="min-w-32 border-b border-r border-table-border bg-muted p-2 text-center text-xs text-muted-foreground"
                >
                    {!selected ? <span className="sr-only">Not applicable</span> : 'N/A'}
                </td>
            );
        }

        if (!editable && !locked) {
            return (
                <td
                    key={moduleKey}
                    className="min-w-32 border-b border-r border-table-border bg-muted p-2 text-xs text-muted-foreground"
                >
                    Read only
                </td>
            );
        }

        const cellQuestion = question.options_by_module?.[moduleKey]
            ? { ...question, options: question.options_by_module[moduleKey] }
            : question;

        return (
            <td key={moduleKey}
                ref={(node) => { if (node) fieldRefs.current.set(cellKey, node); else fieldRefs.current.delete(cellKey); }}
                className={`min-w-40 border-b border-r border-table-border p-2 ${missing ? 'border-l-4 border-l-status-warning-foreground bg-status-warning/50' : 'bg-background'} ${pulseKey === cellKey ? 'ring-2 ring-status-warning-foreground motion-safe:animate-pulse' : ''}`}>
                {missing ? <span className="sr-only">Required</span> : null}
                {renderFieldInput(
                    cellQuestion,
                    value,
                    (nextValue) => handleCellChange(question.question_id, moduleKey, nextValue),
                    label,
                    errorId,
                    `${submissionId || 'new'}-${cellKey}`,
                    locked,
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
        const missing = applicableModules.some((key) => isRequired(question, key))
            && !String(value).trim();

        return (
            <div key={question.question_id}
                ref={(node) => { applicableModules.forEach((key) => {
                    const fieldKey = getCellKey(question.question_id, key);
                    if (node) fieldRefs.current.set(fieldKey, node);
                    else fieldRefs.current.delete(fieldKey);
                }); }}
                className={`min-w-0 space-y-1 ${missing ? 'border-l-4 border-l-status-warning-foreground bg-status-warning/50 pl-2' : ''} ${pulseKey?.startsWith(`${question.question_id}__`) ? 'ring-2 ring-status-warning-foreground motion-safe:animate-pulse' : ''}`}>
                {missing ? <span className="sr-only">Required</span> : null}
                <div className="flex items-center gap-1">
                    <label htmlFor={inputId} className="min-w-0 break-words text-xs font-medium">
                        {label}{(question.required || question.question_id === 'nsb_comment') ? <span className="ml-1 text-destructive">*</span> : null}
                    </label>
                    {renderDescription(question)}
                </div>
                {renderFieldInput(
                    question, value,
                    (nextValue) => handleSharedFieldChange(question, nextValue),
                    label, errorId, undefined, locked || !applicableModules.length, inputId,
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
                                <Button type="button" size="sm" onClick={() => handleSaveDescription(question.question_id)} disabled={loading || locked}>Save</Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => setEditingDescriptionId(null)}>Cancel</Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="whitespace-pre-wrap break-words">{question.description || 'No description yet'}</p>
                            <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => startEditingDescription(question)}>
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
                <h1 className="sr-only">Quality Matrix</h1>
                {modeSwitch}
                <label className="ml-1 text-sm font-medium" htmlFor="matrix-role">Role</label>
                <select
                    id="matrix-role"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={role}
                    onChange={(event) => handleRoleChange(event.target.value)}
                    disabled={loading || locked}
                >
                    <option value="TI">TI</option>
                    <option value="ME">ME</option>
                    <option value="ALL">View All (TI + ME)</option>
                </select>
                <Popover open={modulesOpen} onOpenChange={setModulesOpen}>
                    <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" aria-label={`Show columns (${visibleModules.length})`} disabled={!modules.length}>
                            Show columns ({visibleModules.length}) <ChevronsUpDown aria-hidden="true" className="ml-2 size-4" />
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
                                            disabled={!module.enabled_default}
                                            onSelect={() => setVisibleModules((previous) => previous.includes(module.module_key)
                                                ? previous.filter((key) => key !== module.module_key)
                                                : [...previous, module.module_key])}
                                        >
                                            <Checkbox checked={visibleModules.includes(module.module_key)} tabIndex={-1} className="pointer-events-none mr-2" />
                                            {module.module_label || module.module_key}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                <Button type="button" size="sm" variant="outline"
                    className={missingKeys.length ? 'border-status-warning-foreground text-status-warning-foreground' : ''}
                    onClick={nextMissing} disabled={!missingKeys.length || locked}>
                    {missingKeys.length ? `Next missing (${missingKeys.length})` : 'All required filled'}
                </Button>
                <div className="ml-auto flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={handleSaveDraft} disabled={loading || locked || Boolean(conflict) || !selectedModules.length}>
                        {loading ? 'Working...' : 'Save Draft'}
                    </Button>
                    <Button type="button" size="sm" onClick={handleSubmitFinal} disabled={loading || locked || Boolean(conflict) || !selectedModules.length}>
                        {loading ? 'Working...' : 'Submit Final'}
                    </Button>
                </div>
            </div>

            {submissionStatus === 'final' ? (
                <div className="flex shrink-0 items-center justify-between gap-2 rounded border border-table-border bg-muted px-3 py-2 text-sm">
                    <span>{locked ? 'Final submission — read-only' : 'Editing final submission (unlocked)'}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                        if (locked) setPinOpen(true);
                        else { setEditPin(''); setEditReason(''); }
                    }}>{locked ? 'Edit final submission' : 'Lock again'}</Button>
                </div>
            ) : null}

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

            {sharedQuestions.length || modules.length ? (
                <div className="grid shrink-0 grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
                    <div className="min-w-0 space-y-1">
                        <span id={`${instanceId}-applicable-label`} className="text-xs font-medium">Applicable modules</span>
                        <Popover open={applicableOpen} onOpenChange={setApplicableOpen}>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="outline" className="w-full min-w-0 justify-between font-normal"
                                    aria-labelledby={`${instanceId}-applicable-label`}
                                    disabled={locked || loading || !modules.length}>
                                    <span className="truncate">{selectedModules.length
                                        ? `${selectedModules.length} applicable: ${selectedModules.join(', ')}`
                                        : 'Select applicable modules'}</span>
                                    <ChevronsUpDown className="ml-2 size-4 shrink-0" aria-hidden="true" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64 p-0">
                                <Command>
                                    <CommandInput placeholder="Search applicable modules" />
                                    <CommandList>
                                        <CommandEmpty>No modules found.</CommandEmpty>
                                        <CommandGroup>
                                            {sortedModules.map((module) => (
                                                <CommandItem key={module.module_key}
                                                    value={`${module.module_label || module.module_key} ${module.module_key}`}
                                                    disabled={!module.enabled_default || loading}
                                                    onSelect={() => handleModuleToggle(module.module_key)}>
                                                    <Checkbox checked={selectedModules.includes(module.module_key)} tabIndex={-1} className="pointer-events-none mr-2" />
                                                    {module.module_label || module.module_key}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        {selectedModules.length ? <div className="flex flex-wrap gap-1">{selectedModules.map((key) =>
                            <span key={key} className="rounded border px-1 text-xs">{key}</span>)}</div> : null}
                    </div>
                    {sharedQuestions.map(renderSharedField)}
                </div>
            ) : null}

            {hiddenApplicable.length ? (
                <div className="flex shrink-0 items-center gap-2 text-xs" role="status">
                    {hiddenApplicable.length} applicable modules hidden · {missingKeys.length} required cells missing
                    <Button type="button" variant="outline" size="sm" onClick={() => setVisibleModules((previous) => [...new Set([...previous, ...selectedModules])])}>
                        Show all applicable
                    </Button>
                </div>
            ) : null}

            <div ref={tableRef} className={`min-h-[320px] min-w-0 overflow-auto rounded-md border border-table-border bg-card md:min-h-0 md:flex-1 ${scrollbarClassName}`}>
                {selectedModules.length === 0 ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
                        <p>Select applicable modules to start</p>
                        <Button type="button" variant="outline" onClick={() => setApplicableOpen(true)} disabled={!modules.length || locked}>Select applicable modules</Button>
                    </div>
                ) : (
                <table style={{ minWidth: 48 + 256 + 64 + selectedModuleDetails.length * 160 }}
                    className="w-full table-fixed border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr className="bg-table-header text-table-header-foreground">
                            <th style={numberColumn} className="sticky top-0 z-30 border-b border-r border-white/20 bg-table-header p-2">
                                No
                            </th>
                            <th style={labelColumn} className="sticky top-0 z-30 border-b-2 border-r-2 border-white/20 bg-table-header py-2 pl-2 pr-3 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                                Header
                            </th>
                            <th className="sticky top-0 z-20 w-16 border-b border-r border-white/20 bg-table-header p-2">
                                Role
                            </th>

                            {selectedModuleDetails.map((module) => (
                                <th
                                    key={module.module_key}
                                    scope="col"
                                    className="sticky top-0 z-20 w-40 border-b border-r border-white/20 bg-table-header p-2"
                                >
                                    {module.module_label || module.module_key}
                                    {selectedModules.includes(module.module_key) ? (() => {
                                        const required = questions.filter((question) => isRequired(question, module.module_key));
                                        const filled = required.filter((question) => String(expanded[getCellKey(question.question_id, module.module_key)] || '').trim()).length;
                                        return <span className="mt-1 flex items-center justify-center gap-1 text-xs"
                                            aria-label={`${module.module_key}: ${filled} of ${required.length} required filled`}>
                                            {filled}/{required.length} {filled === required.length ? <Check className="size-3" aria-hidden="true" /> : null}
                                        </span>;
                                    })() : null}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {tableQuestions.length === 0 ? (
                            <tr>
                                <td
                                    className="border-b border-r border-table-border p-3 text-muted-foreground"
                                    colSpan={3 + selectedModuleDetails.length}
                                >
                                    No matrix rows found.
                                </td>
                            </tr>
                        ) : null}

                        {tableQuestions.map((question, index) => (
                            <tr key={question.question_id} className="group even:bg-table-stripe hover:bg-table-hover">
                                <td style={numberColumn} className="sticky z-10 border-b border-r border-table-border bg-table-frozen p-2 text-center group-hover:bg-table-hover">
                                    {index + 1}
                                </td>

                                <th scope="row" style={labelColumn} className="sticky z-10 border-b-2 border-r-2 border-table-border bg-primary py-2 pl-2 pr-3 text-left align-top font-medium text-primary-foreground shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] [overflow-wrap:anywhere]">
                                    <span className="flex items-start gap-1">
                                        <span className="min-w-0 flex-1">
                                            {question.display_label || question.header || question.question_id}
                                            {question.required ? <span className="ml-1">*</span> : null}
                                        </span>
                                        {renderDescription(question, true)}
                                    </span>
                                    {APPLY_TO_ALL_QUESTION_IDS.has(question.question_id) && (() => {
                                        const { source, targets } = applyTargets(question);
                                        return <Button type="button" size="sm" variant="outline"
                                            className="mt-1 h-7 border-white bg-white px-1.5 text-xs text-primary hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white"
                                            aria-label={`Apply ${question.display_label || question.header || question.question_id} to all selected modules`}
                                            disabled={!source || !targets.length || loading || locked}
                                            onClick={() => handleApply(question)}>
                                            <CopyCheck aria-hidden="true" className="mr-1 size-3.5" /> Apply to all
                                        </Button>;
                                    })()}
                                </th>

                                <td className="border-b border-r border-table-border p-2 text-center font-medium">
                                    {question.role}
                                </td>

                                {selectedModuleDetails.map((module) => renderCell(question, module))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                )}
            </div>
            <AlertDialog open={Boolean(pendingApply)} onOpenChange={(open) => !open && setPendingApply(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Overwrite {pendingApply?.overwriteCount} cells?</AlertDialogTitle>
                        <AlertDialogDescription>Existing answers in these modules will be replaced.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => commitApply(pendingApply.question, pendingApply.source, pendingApply.targets)}>Overwrite</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={Boolean(pendingRemove)} onOpenChange={(open) => !open && setPendingRemove(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove {pendingRemove?.moduleKey}?</AlertDialogTitle>
                        <AlertDialogDescription>Its {pendingRemove?.count} filled cells will be deleted.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => changeApplicable(pendingRemove.moduleKey, true)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Dialog open={pinOpen} onOpenChange={(open) => {
                setPinOpen(open);
                if (!open) { setPinDraft(''); setPinError(''); }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit final submission</DialogTitle>
                        <DialogDescription>Enter the edit PIN to unlock this submission.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={verifyPin} className="space-y-3">
                        <label className="block text-sm font-medium" htmlFor={`${instanceId}-pin`}>Edit PIN</label>
                        <input id={`${instanceId}-pin`} type="password" inputMode="numeric" autoComplete="off"
                            required value={pinDraft} onChange={(event) => setPinDraft(event.target.value)}
                            aria-invalid={Boolean(pinError)} aria-describedby={pinError ? `${instanceId}-pin-error` : undefined}
                            className="w-full rounded border bg-background p-2" />
                        {pinError ? <p id={`${instanceId}-pin-error`} role="alert" className="text-sm text-destructive">{pinError}</p> : null}
                        <label className="block text-sm font-medium" htmlFor={`${instanceId}-reason`}>Reason for edit (optional)</label>
                        <textarea id={`${instanceId}-reason`} value={editReason}
                            onChange={(event) => setEditReason(event.target.value)} className="w-full rounded border bg-background p-2" />
                        <DialogFooter><Button type="submit" disabled={verifying}>{verifying ? 'Verifying...' : 'Unlock'}</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}