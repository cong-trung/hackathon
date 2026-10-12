import { apiSlice } from './apiSlice';

export const productActionMatrixApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getProductActionMatrix: builder.query({
            query: ({ moduleGroup } = {}) => ({
                url: '/pypcs/product-action-matrix',
                params: moduleGroup ? { module_group: moduleGroup } : undefined,
            }),
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
    useGetProductActionMatrixQuery,
    useUpdateProductActionMatrixRowMutation,
} = productActionMatrixApi;