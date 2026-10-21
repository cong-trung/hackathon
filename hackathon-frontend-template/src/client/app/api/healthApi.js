import { apiSlice } from './apiSlice';

export const healthApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        health: builder.mutation({
            query: () => ({
                url: '/health',
                method: 'get',
            }),
        }),
    }),
});

export const { useHealthMutation } = healthApi;
