import { apiSlice } from './apiSlice';

export const chatApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        sendChatMessage: builder.mutation({
            query: ({ message, history }) => ({
                url: '/chat',
                method: 'POST',
                body: { message, history },
            }),
        }),
    }),
});

export const { useSendChatMessageMutation } = chatApi;
