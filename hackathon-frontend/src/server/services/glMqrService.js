import { forwardRequest } from '../utils/forwardRequest.js';
import { parseError } from '../utils/parseError.js';

export const getSTHI = async (req, res) => {
    try {
        const result = await forwardRequest('/solutions/sthi', req);
        res.json(result);
    } catch (error) {
        console.error('Error fetching STHI:', error);
        const parsedError = parseError(error);
        res.status(parsedError.status).json(parsedError);
    }
};

export const getLCBI = async (req, res) => {
    try {
        const result = await forwardRequest('/solutions/lcbi', req);
        res.json(result);
    } catch (error) {
        console.error('Error fetching LCBI:', error);
        const parsedError = parseError(error);
        res.status(parsedError.status).json(parsedError);
    }
};
