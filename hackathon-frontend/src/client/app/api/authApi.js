import { apiSlice } from './apiSlice';

export const authApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getMe: builder.query({
            query: () => '/auth/me',
            providesTags: ['Auth'],
        }),
        login: builder.mutation({
            query: (body) => ({ url: '/auth/login', method: 'POST', body }),
            invalidatesTags: ['Auth', 'Users'],
        }),
        logout: builder.mutation({
            query: () => ({ url: '/auth/logout', method: 'POST', body: {} }),
            invalidatesTags: ['Auth', 'Users'],
        }),
        requestAccount: builder.mutation({
            query: (body) => ({ url: '/auth/request-account', method: 'POST', body }),
        }),
        listUsers: builder.query({
            query: (status) => ({ url: '/auth/users', params: { status } }),
            providesTags: ['Users'],
        }),
        approveUser: builder.mutation({
            query: ({ username, role }) => ({
                url: `/auth/users/${encodeURIComponent(username)}/approve`,
                method: 'POST',
                body: { role },
            }),
            invalidatesTags: ['Users', 'Auth'],
        }),
        rejectUser: builder.mutation({
            query: (username) => ({
                url: `/auth/users/${encodeURIComponent(username)}/reject`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: ['Users'],
        }),
        disableUser: builder.mutation({
            query: (username) => ({
                url: `/auth/users/${encodeURIComponent(username)}/disable`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: ['Users'],
        }),
    }),
});

export const {
    useGetMeQuery,
    useLoginMutation,
    useLogoutMutation,
    useRequestAccountMutation,
    useListUsersQuery,
    useApproveUserMutation,
    useRejectUserMutation,
    useDisableUserMutation,
} = authApi;