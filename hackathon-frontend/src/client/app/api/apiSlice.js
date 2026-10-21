import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const fetchQuery = fetchBaseQuery({ baseUrl: '/api' });

const baseQuery = async (args, api, extraOptions) => {
    const result = await fetchQuery(args, api, extraOptions);
    const path = typeof args === 'string' ? args : args.url;

    if (
        result.error?.status === 401 &&
        result.error.data?.code === 'unauthenticated' &&
        !/^\/?auth(?:\/|$)/.test(path) &&
        window.location.pathname !== '/login'
    ) {
        const next = window.location.pathname + window.location.search;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }

    return result;
};

export const apiSlice = createApi({
    reducerPath: 'api',
    baseQuery,
    tagTypes: ['Auth', 'PdSolution', 'PYPCSActionItem', 'ProductActionMatrix'],
    endpoints: () => ({}),
});
