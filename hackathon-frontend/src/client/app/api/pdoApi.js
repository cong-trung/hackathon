import { apiSlice } from './apiSlice';

export const pdoApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getSTHI: builder.query({
            query: () => ({
                url: '/pdo/sthi',
                method: 'get',
            }),
        }),
        getLCBI: builder.query({
            query: () => ({
                url: '/pdo/lcbi',
                method: 'get',
            }),
        }),
    }),
});

export const { useGetSTHIQuery, useGetLCBIQuery } = pdoApi;
