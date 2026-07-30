import axios from 'axios';

import { config } from '../config/env.js';

export const forwardRequest = async (path, req) => {
    try {
        // Extract key headers we want to preserve
        const authHeader =
            req.headers?.authorization || req.headers?.Authorization;

        // Build clean headers object
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        // Add authorization if present
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }

        // Add query params to URL
        const queryString = new URLSearchParams(req.query).toString();
        const fullUrl = `${config.djangoBaseUrl}${path}${
            queryString ? `?${queryString}` : ''
        }`;

        const response = await axios({
            method: req.method || 'GET',
            url: fullUrl,
            data: req.body,
            headers: headers,
            proxy: false,
        });

        return response.data;
    } catch (error) {
        throw {
            response: {
                data: error.response?.data || error.message,
                status: error.response?.status || 500,
            },
        };
    }
};
