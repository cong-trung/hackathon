import { apiSlice } from './apiSlice';

export const tiApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getSTHI: builder.query({
            query: () => ({
                url: '/ti/sthi',
                method: 'get',
            }),
        }),
        getLCBI: builder.query({
            query: () => ({
                url: '/ti/lcbi',
                method: 'get',
            }),
        }),
    }),
});

export const { useGetSTHIQuery, useGetLCBIQuery } = tiApi;
