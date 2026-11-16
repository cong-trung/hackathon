export const submissionTabs = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'waiting_me', label: 'Waiting for ME' },
    { key: 'final', label: 'Final' },
];

export function mergeSubmissionTabs(meta) {
    return submissionTabs.map((tab) => ({
        ...tab,
        count: meta?.tabs?.find((item) => item.key === tab.key)?.count,
    }));
}