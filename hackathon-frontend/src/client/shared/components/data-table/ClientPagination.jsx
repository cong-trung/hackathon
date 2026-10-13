import { Button } from '@/shared/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/components/ui/select';

export default function ClientPagination({ label, total, page, pageSize, onPageChange, onPageSizeChange }) {
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, lastPage);
    const start = total ? (currentPage - 1) * pageSize + 1 : 0;
    const end = Math.min(currentPage * pageSize, total);

    return (
        <nav aria-label={`${label} pagination`} className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2">
                Rows per page
                <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                    <SelectTrigger aria-label={`${label} rows per page`} className="w-20">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {[10, 25, 50].map((size) => (
                            <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </label>
            <span className="text-muted-foreground">Showing {start}–{end} of {total}</span>
            <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" aria-label={`Previous ${label} page`}
                    disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
                    Previous
                </Button>
                <Button type="button" size="sm" variant="outline" aria-label={`Next ${label} page`}
                    disabled={currentPage >= lastPage} onClick={() => onPageChange(currentPage + 1)}>
                    Next
                </Button>
            </div>
        </nav>
    );
}