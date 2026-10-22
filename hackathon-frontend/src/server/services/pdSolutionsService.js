import { forwardRequest } from '../utils/forwardRequest.js';
import { parseError } from '../utils/parseError.js';

export const getPdSolutions = async (req, res) => {
    try {
        const module = encodeURIComponent(String(req.params.module));
        const result = await forwardRequest(`/pdsolutions/${module}`, req);
        res.json(result);
    } catch (error) {
        console.error('Error fetching pd solution:', error);
        const parsedError = parseError(error);
        res.status(parsedError.status).json(parsedError.body);
    }
};

export const updatePdSolutions = async (req, res) => {
    try {
        const module = encodeURIComponent(String(req.params.module));
        const result = await forwardRequest(`/pdsolutions/${module}`, req);
        res.json(result);
    } catch (error) {
        console.error('Error updating pd solution:', error);
        const parsedError = parseError(error);
        res.status(parsedError.status).json(parsedError.body);
    }
};
