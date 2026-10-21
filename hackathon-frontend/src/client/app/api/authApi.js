import { apiSlice } from './apiSlice';

export const authApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getMe: builder.query({
            query: () => '/auth/me',
            providesTags: ['Auth'],
        }),
        createSession: builder.mutation({
            query: (profile) => ({
                url: '/auth/session',
                method: 'POST',
                body: profile,
            }),
            invalidatesTags: ['Auth'],
        }),
        logout: builder.mutation({
            query: () => ({ url: '/auth/logout', method: 'POST' }),
            invalidatesTags: ['Auth'],
        }),
    }),
});

export const {
    useGetMeQuery,
    useCreateSessionMutation,
    useLogoutMutation,
} = authApi;