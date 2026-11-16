import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';

export default function ServerPagination({ label, total, limit, offset, onOffsetChange, onLimitChange }) {
    const lastOffset = Math.max(0, Math.ceil(total / limit) - 1) * limit;
    return (
        <nav aria-label={`${label} pagination`} className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2">Rows per page
                <Select value={String(limit)} onValueChange={(value) => onLimitChange(Number(value))}>
                    <SelectTrigger aria-label={`${label} rows per page`} className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{[25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
                </Select>
            </label>
            <span className="text-muted-foreground">Showing {total ? offset + 1 : 0}–{Math.min(offset + limit, total)} of {total}</span>
            <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" aria-label={`Previous ${label} page`} disabled={offset <= 0} onClick={() => onOffsetChange(Math.max(0, offset - limit))}>Previous</Button>
                <Button type="button" size="sm" variant="outline" aria-label={`Next ${label} page`} disabled={offset >= lastOffset} onClick={() => onOffsetChange(offset + limit)}>Next</Button>
            </div>
        </nav>
    );
}