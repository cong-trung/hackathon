import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const rawBaseQuery = fetchBaseQuery({ baseUrl: '/api' });

export const apiSlice = createApi({
    reducerPath: 'api',
    baseQuery: async (args, api, extraOptions) => {
        const result = await rawBaseQuery(args, api, extraOptions);
        if (api.type === 'mutation' && result.error?.status === 401) {
            api.dispatch(apiSlice.util.invalidateTags(['Auth']));
        }
        return result;
    },
    tagTypes: ['PdSolution', 'PYPCSActionItem', 'ProductActionMatrix', 'Auth', 'Users'],
    endpoints: () => ({}),
});
