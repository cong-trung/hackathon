import express from 'express';
import { getSTHI, getLCBI } from '../../services/tiService.js';

const router = express.Router();

router.get('/ti/sthi', getSTHI);
router.get('/ti/lcbi', getLCBI);

export default router;
