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
        guestLogin: builder.mutation({
            query: () => ({ url: '/auth/guest', method: 'POST', body: {} }),
            invalidatesTags: ['Auth', 'Users'],
        }),
        logout: builder.mutation({
            query: () => ({ url: '/auth/logout', method: 'POST', body: {} }),
            invalidatesTags: ['Auth', 'Users'],
        }),
        changePassword: builder.mutation({
            query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
        }),
        requestAccount: builder.mutation({
            query: (body) => ({ url: '/auth/request-account', method: 'POST', body }),
        }),
        getUsersMeta: builder.query({
            query: () => '/auth/users/meta',
            keepUnusedDataFor: 60,
            providesTags: ['Users'],
        }),
        getUsersPage: builder.query({
            query: (params) => ({ url: '/auth/users', params: { view: 'page', ...params } }),
            keepUnusedDataFor: 30,
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
        changeUserRole: builder.mutation({
            query: ({ username, role }) => ({
                url: `/auth/users/${encodeURIComponent(username)}/role`,
                method: 'PATCH',
                body: { role },
            }),
            invalidatesTags: ['Users', 'Auth', 'Changes'],
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
    useGuestLoginMutation,
    useLoginMutation,
    useLogoutMutation,
    useChangePasswordMutation,
    useRequestAccountMutation,
    useGetUsersMetaQuery,
    useGetUsersPageQuery,
    useApproveUserMutation,
    useChangeUserRoleMutation,
    useRejectUserMutation,
    useDisableUserMutation,
} = authApi;