import axios from 'axios';

import { config } from '../config/env.js';
export const getAuthorizationHeader = (req) => {
    const authorization =
        req.headers?.authorization || req.headers?.Authorization;
    if (authorization) return authorization;

    let token = req.cookies?.qm_token;
    if (!token) {
        const cookie = req.headers?.cookie || '';
        const value = cookie
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith('qm_token='));
        if (value) {
            try {
                token = decodeURIComponent(value.slice('qm_token='.length));
            } catch {
                token = value.slice('qm_token='.length);
            }
        }
    }
    return token ? `Bearer ${token}` : undefined;
};

export const forwardRequest = async (path, req) => {
    try {
        // Extract key headers we want to preserve
        const authHeader = getAuthorizationHeader(req);

        // Build clean headers object
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        // Add authorization if present
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }
        const clientIp = req.ip || req.headers?.['x-forwarded-for'];
        if (clientIp) {
            headers['X-Forwarded-For'] = clientIp;
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
        if (error.response) {
            throw {
                response: {
                    data: error.response.data,
                    status: error.response.status,
                },
            };
        }
        throw error;
    }
};
