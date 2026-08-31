import express from 'express';
import {
    getPdSolutions,
    updatePdSolutions,
} from '../../services/pdSolutionsService.js';

const router = express.Router();

router.get('/pdsolutions/:module', getPdSolutions);
router.post('/pdsolutions/:module', updatePdSolutions);

export default router;
