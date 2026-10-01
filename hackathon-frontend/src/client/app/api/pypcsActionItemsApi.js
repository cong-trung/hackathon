import { apiSlice } from './apiSlice';

export const pypcsActionItemsApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getActionItems: builder.query({
            query: () => '/pypcs/action-items',
            providesTags: ['PYPCSActionItem'],
        }),
        getActionItemOptions: builder.query({
            query: () => '/pypcs/action-items/options',
        }),
        createActionItem: builder.mutation({
            query: (body) => ({
                url: '/pypcs/action-items',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['PYPCSActionItem'],
        }),
        updateActionItem: builder.mutation({
            query: ({ nbr, body }) => ({
                url: `/pypcs/action-items/${nbr}`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['PYPCSActionItem'],
        }),
    }),
});

export const {
    useGetActionItemsQuery,
    useGetActionItemOptionsQuery,
    useCreateActionItemMutation,
    useUpdateActionItemMutation,
} = pypcsActionItemsApi;