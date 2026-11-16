import { useEffect, useState } from 'react';

export default function useServerTable({ initialSort = 'created_at', initialDir = 'desc', tabKey } = {}) {
    const [search, setSearchInput] = useState('');
    const [q, setQ] = useState('');
    const [sort, setSort] = useState(initialSort);
    const [dir, setDir] = useState(initialDir);
    const [limit, setLimit] = useState(25);
    const [pagination, setPagination] = useState({ tabKey, offset: 0 });
    const offset = pagination.tabKey === tabKey ? pagination.offset : 0;
    const setOffset = (value) => setPagination({ tabKey, offset: value });

    useEffect(() => {
        const timer = setTimeout(() => setQ(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    function setSearch(value) { setSearchInput(value); setOffset(0); }

    function changeSort(key) {
        setDir(sort === key && dir === 'asc' ? 'desc' : 'asc');
        setSort(key);
        setOffset(0);
    }

    function changeLimit(value) { setLimit(value); setOffset(0); }

    return {
        search, setSearch, args: { q, sort, dir, limit, offset }, sort, dir, limit, offset,
        changeSort, changeLimit, setOffset, resetOffset: () => setOffset(0),
    };
}