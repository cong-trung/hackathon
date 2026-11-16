import { useCallback, useEffect, useState } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';

import { useAuth } from '@/shared/hooks/useAuth';
import { useGetOptionReviewsMetaQuery } from '@/app/api/pypcsOptionReviewApi';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';

import PYPCSSubmissionsReview from './PYPCSSubmissionsReview';
import PYPCSFieldOptions from './PYPCSFieldOptions';

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

export default function PYPCSMatrixTab() {
    const { permissions, isAdmin, isTI } = useAuth();
    const canReviewOptions = isAdmin || isTI;
    const { data: optionsMeta } = useGetOptionReviewsMetaQuery(undefined, { skip: !canReviewOptions });
    const pendingCount = optionsMeta?.tabs?.find((tab) => tab.key === 'pending')?.count ?? 0;
    const location = useLocation();
    const submissionLink = new URLSearchParams(location.search).get('submission');
    const [activeMode, setActiveMode] = useState('matrix');
    const [openedSubmission, setOpenedSubmission] = useState(false);
    const [resumeSubmission, setResumeSubmission] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [dirty, setDirty] = useState(false);
    const [pendingMode, setPendingMode] = useState(null);
    const blocker = useBlocker(dirty);
    const onDirtyChange = useCallback((value) => setDirty(value), []);

    useEffect(() => {
        if (!submissionLink) return undefined;
        let cancelled = false;
        requestJson(`/pypcs/submissions/${encodeURIComponent(submissionLink)}`)
            .then((detail) => {
                if (!cancelled) {
                    setResumeSubmission(detail);
                    setOpenedSubmission(true);
                    setActiveMode('matrix');
                }
            })
            .catch((error) => { if (!cancelled) setStatusMessage(`Failed to load submission: ${error.message}`); });
        return () => { cancelled = true; };
    }, [submissionLink]);

    useEffect(() => {
        const warn = (event) => {
            if (!dirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    function changeMode(mode) {
        if (mode === activeMode) return;
        if (dirty) setPendingMode(mode);
        else {
            if (mode !== 'matrix') setOpenedSubmission(false);
            setActiveMode(mode);
        }
    }

    async function handleContinueEditing(submissionId) {
        setStatusMessage('');
        try {
            const detail = await requestJson(
                `/pypcs/submissions/${submissionId}`,
            );

            setResumeSubmission(detail);
            setOpenedSubmission(true);
            setActiveMode('matrix');
        } catch (error) {
            setStatusMessage(
                `Failed to load submission for editing: ${error.message}`,
            );
        }
    }

    const modeSwitch = (
        <div className="flex shrink-0 gap-2">
                {(permissions.can_create_product || submissionLink) && (
                    <button
                        type="button"
                        aria-pressed={activeMode === 'matrix'}
                        className={`rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${
                            activeMode === 'matrix'
                                ? 'border-primary/50 bg-accent text-foreground'
                                : 'bg-card'
                        }`}
                        onClick={() => changeMode('matrix')}
                    >
                        Matrix Submission
                    </button>
                )}

                <button
                    type="button"
                    aria-pressed={activeMode === 'review'}
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${
                        activeMode === 'review'
                            ? 'border-primary/50 bg-accent text-foreground'
                            : 'bg-card'
                    }`}
                    onClick={() => changeMode('review')}
                >
                    Review Submissions
                </button>
                {canReviewOptions && (
                    <button type="button" aria-pressed={activeMode === 'options'}
                        className={`rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${activeMode === 'options' ? 'border-primary/50 bg-accent text-foreground' : 'bg-card'}`}
                        onClick={() => changeMode('options')}>
                        Field options <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground" aria-label={`${pendingCount} pending field options`}>{pendingCount}</span>
                    </button>
                )}
        </div>
    );

    return (
        <div className="md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
            {statusMessage ? <div role="alert">{statusMessage}</div> : null}
            {activeMode === 'options' && canReviewOptions ? (
                <PYPCSFieldOptions modeSwitch={modeSwitch} />
            ) : activeMode === 'review' || (!permissions.can_create_product && !openedSubmission && !submissionLink) ? (
                <PYPCSSubmissionsReview
                    onContinueEditing={handleContinueEditing}
                    modeSwitch={modeSwitch}
                />
            ) : (
                <PYPCSMatrixSubmission
                    resumeSubmission={resumeSubmission}
                    onResumeHandled={() => setResumeSubmission(null)}
                    modeSwitch={modeSwitch}
                    onDirtyChange={onDirtyChange}
                />
            )}
            <AlertDialog open={Boolean(pendingMode) || blocker.state === 'blocked'}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingMode(null);
                        if (blocker.state === 'blocked') blocker.reset();
                    }
                }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
                        <AlertDialogDescription>Your changes will be lost.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Stay</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            if (blocker.state === 'blocked') blocker.proceed();
                            if (pendingMode) setActiveMode(pendingMode);
                            if (pendingMode && pendingMode !== 'matrix') setOpenedSubmission(false);
                            setPendingMode(null);
                            setDirty(false);
                        }}>Leave</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}