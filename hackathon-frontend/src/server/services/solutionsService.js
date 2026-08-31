import { forwardRequest } from '../utils/forwardRequest.js';
import { parseError } from '../utils/parseError.js';

export const getSolutions = async (req, res) => {
    try {
        const result = await forwardRequest('/solutions', req);
        res.json(result);
    } catch (error) {
        console.error('Error fetching solutions:', error);
        const parsedError = parseError(error);
        res.status(parsedError.status).json(parsedError);
    }
};
