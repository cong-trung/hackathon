export const matrixTabs = [{ key: '__all__', label: 'All' }];

export function mergeMatrixTabs(meta) {
    return (meta?.tabs ?? matrixTabs).map((tab) => ({
        ...tab,
        label: tab.label || matrixTabs.find((item) => item.key === tab.key)?.label || tab.key,
    }));
}