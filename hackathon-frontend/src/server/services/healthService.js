import { forwardRequest } from '../utils/forwardRequest.js';
import { parseError } from '../utils/parseError.js';

export const getHealth = async (req, res) => {
    try {
        const result = await forwardRequest('/health', req);
        res.json(result);
    } catch (error) {
        console.error('Error fetching health:', error);
        const parsedError = parseError(error);
        res.status(parsedError.status).json(parsedError);
    }
};
