import express from 'express';
import { getHealth } from '../../services/healthService.js';

const router = express.Router();

router.get('/health', getHealth);

export default router;
