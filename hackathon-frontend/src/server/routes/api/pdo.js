import express from 'express';
import { getSTHI, getLCBI } from '../../services/pdoService.js';

const router = express.Router();

router.get('/pdo/sthi', getSTHI);
router.get('/pdo/lcbi', getLCBI);

export default router;
