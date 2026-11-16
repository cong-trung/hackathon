import axios from 'axios';
import { pipeline } from 'stream';

import { config } from '../config/env.js';
import {
    forwardRequest,
    getAuthorizationHeader,
} from '../utils/forwardRequest.js';
import { parseError } from '../utils/parseError.js';

export const getAdminChanges = async (req, res) => {
    try {
        const result = await forwardRequest('/admin/changes', req);
        res.json(result);
    } catch (error) {
        console.error('Error fetching admin changes:', error);
        const parsedError = parseError(error);
        res.status(parsedError.status).json(parsedError.body);
    }
};

export const exportAdminChangesCsv = async (req, res) => {
    try {
        const queryString = new URLSearchParams(req.query).toString();
        const authorization = getAuthorizationHeader(req);
        const response = await axios({
            method: 'GET',
            url: `${config.djangoBaseUrl}/admin/changes/export.csv${
                queryString ? `?${queryString}` : ''
            }`,
            headers: authorization ? { Authorization: authorization } : {},
            responseType: 'stream',
            proxy: false,
            validateStatus: () => true,
        });

        res.status(response.status);
        res.setHeader('Cache-Control', 'no-store');
        for (const header of ['content-type', 'content-disposition']) {
            const value = response.headers[header];
            if (value) res.setHeader(header, value);
        }
        pipeline(response.data, res, (error) => {
            if (error) console.error('Error streaming admin changes CSV:', error);
        });
    } catch (error) {
        console.error('Error exporting admin changes CSV:', error);
        res.status(502).json({ code: 'proxy_error', message: 'Backend unavailable' });
    }
};
