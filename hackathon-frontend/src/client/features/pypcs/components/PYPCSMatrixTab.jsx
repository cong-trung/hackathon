import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

import { useAuth } from '@/shared/hooks/useAuth';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';

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

export default function PYPCSMatrixTab() {
    const { isGuest } = useAuth();
    const [activeMode, setActiveMode] = useState(isGuest ? 'review' : 'matrix');
    const [resumeSubmission, setResumeSubmission] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [dirty, setDirty] = useState(false);
    const [pendingMode, setPendingMode] = useState(null);
    const blocker = useBlocker(dirty);
    const onDirtyChange = useCallback((value) => setDirty(value), []);

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
        else setActiveMode(mode);
    }

    async function handleContinueEditing(submissionId) {
        setStatusMessage('');
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

    const modeSwitch = (
        <div className="flex shrink-0 gap-2">
                {!isGuest && (
                    <button
                        type="button"
                        aria-pressed={activeMode === 'matrix'}
                        className={`rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${
                            activeMode === 'matrix'
                                ? 'bg-primary text-primary-foreground'
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
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card'
                    }`}
                    onClick={() => changeMode('review')}
                >
                    Review Submissions
                </button>
        </div>
    );

    return (
        <div className="md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
            {statusMessage ? <div role="alert">{statusMessage}</div> : null}
            {activeMode === 'review' ? (
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
                            setPendingMode(null);
                            setDirty(false);
                        }}>Leave</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}