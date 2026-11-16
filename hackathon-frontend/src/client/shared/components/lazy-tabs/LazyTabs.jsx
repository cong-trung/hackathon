import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { scrollbarClassName } from '@/shared/utils/scrollbar';

export default function LazyTabs({ tabs, activeKey, onChange, renderPanel, loading, urlParam = 'tab' }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const visibleTabs = tabs.filter((tab) => !tab.hidden);
    const firstKey = visibleTabs[0]?.key;
    const selectedKey = visibleTabs.some((tab) => tab.key === activeKey) ? activeKey : firstKey;

    useEffect(() => {
        if (loading || !firstKey || (selectedKey === activeKey && (!searchParams.has(urlParam) || searchParams.get(urlParam) === selectedKey))) return;
        if (selectedKey !== activeKey) onChange?.(selectedKey);
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            if (urlParam === 'module' && selectedKey === '__all__') next.delete(urlParam);
            else next.set(urlParam, selectedKey);
            return next;
        }, { replace: true });
    }, [activeKey, firstKey, loading, onChange, searchParams, selectedKey, setSearchParams, urlParam]);

    function select(key) {
        if (key === selectedKey) return;
        onChange?.(key);
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            if (urlParam === 'module' && key === '__all__') next.delete(urlParam);
            else next.set(urlParam, key);
            return next;
        }, { replace: true });
    }

    if (loading || !firstKey) return null;
    return (
        <Tabs value={selectedKey} onValueChange={select} className="flex min-w-0 flex-col md:min-h-0 md:flex-1">
            <div className={`overflow-x-auto ${scrollbarClassName}`}>
                <TabsList className="h-auto w-max justify-start gap-1">
                    {visibleTabs.map((tab) => (
                        <TabsTrigger key={tab.key} value={tab.key}>
                            {tab.label}{tab.count != null ? ` (${tab.count})` : ''}{tab.badge}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
            <TabsContent value={selectedKey} className="mt-3 flex min-w-0 flex-col gap-3 md:min-h-0 md:flex-1 md:overflow-hidden" key={selectedKey}>
                {renderPanel(selectedKey)}
            </TabsContent>
        </Tabs>
    );
}