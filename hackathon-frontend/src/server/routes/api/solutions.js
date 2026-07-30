import express from 'express';
import { getSolutions } from '../../services/solutionsService.js';

const router = express.Router();

router.get('/solutions', getSolutions);

export default router;
