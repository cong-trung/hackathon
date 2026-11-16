import { apiSlice } from './apiSlice';

export const productActionMatrixApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getProductActionMatrixMeta: builder.query({
            query: () => '/pypcs/product-action-matrix/meta',
            keepUnusedDataFor: 60,
            providesTags: ['ProductActionMatrix'],
        }),
        getProductActionMatrixPage: builder.query({
            query: (params) => ({ url: '/pypcs/product-action-matrix', params: { view: 'page', ...params, fields: 'summary' } }),
            keepUnusedDataFor: 30,
            providesTags: ['ProductActionMatrix'],
        }),
        getProductActionMatrixRow: builder.query({
            query: ({ productKey, moduleGroup }) => ({
                url: '/pypcs/product-action-matrix/row',
                params: { product_key: productKey, module_group: moduleGroup },
            }),
            keepUnusedDataFor: 30,
            providesTags: ['ProductActionMatrix'],
            refetchOnMountOrArgChange: true,
        }),
        updateProductActionMatrixRow: builder.mutation({
            query: (body) => ({
                url: '/pypcs/product-action-matrix/rows',
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['ProductActionMatrix'],
        }),
    }),
});

export const {
    useGetProductActionMatrixMetaQuery,
    useGetProductActionMatrixPageQuery,
    useGetProductActionMatrixRowQuery,
    useUpdateProductActionMatrixRowMutation,
} = productActionMatrixApi;