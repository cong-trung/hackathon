import { apiSlice } from './apiSlice';

export const solutionApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getSolutions: builder.query({
            query: (module) => ({
                url: `/solutions?module=${module}`,
                method: 'get',
            }),
        }),
    }),
});

export const { useGetSolutionsQuery } = solutionApi;
