import { apiSlice } from './apiSlice';

export const pypcsOptionReviewApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getOptionReviews: builder.query({
            query: (status = 'pending') => ({ url: '/pypcs/option-review', params: { status } }),
            providesTags: ['PYPCSOptionReview'],
        }),
        getPypcsQuestions: builder.query({
            query: () => '/pypcs/questions',
            providesTags: ['PYPCSQuestions'],
        }),
        getReviewSubmissions: builder.query({
            async queryFn(_arg, _api, _extraOptions, baseQuery) {
                const items = [];
                let total;
                do {
                    const result = await baseQuery({ url: '/pypcs/submissions', params: { limit: 5000, offset: items.length } });
                    if (result.error) return { error: result.error };
                    items.push(...(result.data?.items || []));
                    total = result.data?.total ?? items.length;
                    if (!result.data?.items?.length) break;
                } while (items.length < total);
                return { data: { items } };
            },
        }),
        decideOption: builder.mutation({
            query: (body) => ({ url: '/pypcs/option-review/decision', method: 'POST', body }),
            invalidatesTags: ['PYPCSOptionReview', 'PYPCSQuestions', 'ProductActionMatrix'],
        }),
    }),
});

export const {
    useGetOptionReviewsQuery,
    useGetPypcsQuestionsQuery,
    useGetReviewSubmissionsQuery,
    useDecideOptionMutation,
} = pypcsOptionReviewApi;