import { apiSlice } from './apiSlice';

export const tiApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getTISTHI: builder.query({
            query: () => ({
                url: '/ti/sthi',
                method: 'get',
            }),
        }),
        getTILCBI: builder.query({
            query: () => ({
                url: '/ti/lcbi',
                method: 'get',
            }),
        }),
    }),
});

export const { useGetTISTHIQuery, useGetTILCBIQuery } = tiApi;
