import { apiSlice } from './apiSlice';

export const pypcsActionItemsApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getActionItemsMeta: builder.query({
            query: () => '/pypcs/action-items/meta',
            keepUnusedDataFor: 60,
            providesTags: ['PYPCSActionItem'],
        }),
        getActionItemsPage: builder.query({
            query: (params) => ({ url: '/pypcs/action-items', params: { view: 'page', ...params } }),
            keepUnusedDataFor: 30,
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
            invalidatesTags: ['PYPCSActionItem', 'ProductActionMatrix'],
        }),
        updateActionItem: builder.mutation({
            query: ({ nbr, body }) => ({
                url: `/pypcs/action-items/${nbr}`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['PYPCSActionItem', 'ProductActionMatrix'],
        }),
        deleteActionItem: builder.mutation({
            query: ({ nbr, expectedVersion }) => ({
                url: `/pypcs/action-items/${nbr}`,
                method: 'DELETE',
                params: expectedVersion ? { expected_version: expectedVersion } : undefined,
            }),
            invalidatesTags: ['PYPCSActionItem', 'ProductActionMatrix'],
        }),
    }),
});

export const {
    useGetActionItemsMetaQuery,
    useGetActionItemsPageQuery,
    useGetActionItemOptionsQuery,
    useCreateActionItemMutation,
    useUpdateActionItemMutation,
    useDeleteActionItemMutation,
} = pypcsActionItemsApi;