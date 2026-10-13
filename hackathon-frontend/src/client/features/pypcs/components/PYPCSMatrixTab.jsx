import { useState } from 'react';

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
    const [activeMode, setActiveMode] = useState('matrix');
    const [resumeSubmission, setResumeSubmission] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');

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
                <button
                    type="button"
                    aria-pressed={activeMode === 'matrix'}
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${
                        activeMode === 'matrix'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card'
                    }`}
                    onClick={() => setActiveMode('matrix')}
                >
                    Matrix Submission
                </button>

                <button
                    type="button"
                    aria-pressed={activeMode === 'review'}
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${
                        activeMode === 'review'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card'
                    }`}
                    onClick={() => setActiveMode('review')}
                >
                    Review Submissions
                </button>
        </div>
    );

    return (
        <div className="p-4 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden">
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
                />
            )}
        </div>
    );
}