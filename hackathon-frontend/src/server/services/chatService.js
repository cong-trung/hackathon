import { forwardRequest } from '../utils/forwardRequest.js';
import { parseError } from '../utils/parseError.js';

export const sendChatMessage = async (req, res) => {
    try {
        const result = await forwardRequest('/chat', req);
        res.json(result);
    } catch (error) {
        console.error('Error calling chat API:', error);
        const parsedError = parseError(error);
        res.status(parsedError.status).json(parsedError);
    }
};
