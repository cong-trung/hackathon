import express from 'express';
import { getSTHI, getLCBI } from '../../services/glMqrService.js';

const router = express.Router();

router.get('/gl-mqr/sthi', getSTHI);
router.get('/gl-mqr/lcbi', getLCBI);

export default router;
