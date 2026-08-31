import { apiSlice } from './apiSlice';

export const glMqrApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getGLMQRSTHI: builder.query({
            query: () => ({
                url: '/gl-mqr/sthi',
                method: 'get',
            }),
        }),
        getGLMQRLCBI: builder.query({
            query: () => ({
                url: '/gl-mqr/lcbi',
                method: 'get',
            }),
        }),
    }),
});

export const { useGetGLMQRSTHIQuery, useGetGLMQRLCBIQuery } = glMqrApi;
