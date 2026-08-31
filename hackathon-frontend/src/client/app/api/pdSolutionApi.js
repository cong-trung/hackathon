import { apiSlice } from './apiSlice';

export const pdSolutionApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getPdSolution: builder.query({
            query: (module) => ({
                url: `/pdsolutions/${module}`,
                method: 'get',
            }),
            providesTags: (result, error, module) => [
                { type: 'PdSolution', id: module },
            ],
            keepUnusedDataFor: 3600,
        }),
        updatePdSolution: builder.mutation({
            query: ({ module, data }) => ({
                url: `/pdsolutions/${module}`,
                method: 'post',
                body: data,
            }),
            invalidatesTags: (result, error, { module }) => [
                { type: 'PdSolution', id: module },
            ],
        }),
    }),
});

export const { useGetPdSolutionQuery, useUpdatePdSolutionMutation } =
    pdSolutionApi;
