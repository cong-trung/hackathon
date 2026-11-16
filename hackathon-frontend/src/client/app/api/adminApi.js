import { apiSlice } from './apiSlice';

export const adminApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getAdminChanges: builder.query({
            query: (params) => ({ url: '/admin/changes', params }),
            providesTags: ['Changes'],
        }),
    }),
});

export const { useGetAdminChangesQuery } = adminApi;