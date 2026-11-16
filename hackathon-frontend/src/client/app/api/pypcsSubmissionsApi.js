import { apiSlice } from './apiSlice';

export const pypcsSubmissionsApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getSubmissionsMeta: builder.query({
            query: () => '/pypcs/submissions/meta',
            keepUnusedDataFor: 60,
            providesTags: ['PYPCSSubmissions'],
        }),
        getSubmissionsPage: builder.query({
            query: (params) => ({ url: '/pypcs/submissions', params }),
            keepUnusedDataFor: 30,
            providesTags: ['PYPCSSubmissions'],
        }),
    }),
});

export const { useGetSubmissionsMetaQuery, useGetSubmissionsPageQuery } = pypcsSubmissionsApi;