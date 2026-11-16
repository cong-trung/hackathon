import { apiSlice } from './apiSlice';

export const pypcsOptionReviewApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getOptionReviewsMeta: builder.query({
            query: () => '/pypcs/option-review/meta',
            keepUnusedDataFor: 60,
            providesTags: ['PYPCSOptionReview'],
        }),
        getOptionReviewsPage: builder.query({
            query: (params) => ({ url: '/pypcs/option-review', params: { view: 'page', ...params } }),
            keepUnusedDataFor: 30,
            providesTags: ['PYPCSOptionReview'],
        }),
        getPypcsQuestions: builder.query({
            query: () => '/pypcs/questions',
            providesTags: ['PYPCSQuestions'],
        }),
        decideOption: builder.mutation({
            query: (body) => ({ url: '/pypcs/option-review/decision', method: 'POST', body }),
            invalidatesTags: ['PYPCSOptionReview', 'PYPCSQuestions', 'ProductActionMatrix'],
        }),
    }),
});

export const {
    useGetOptionReviewsMetaQuery,
    useGetOptionReviewsPageQuery,
    useGetPypcsQuestionsQuery,
    useDecideOptionMutation,
} = pypcsOptionReviewApi;