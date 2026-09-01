import express from 'express';

import healthRouter from './api/health.js';
import tiRouter from './api/ti.js';
import pdoRouter from './api/pdo.js';
import solutionsRouter from './api/solutions.js';
import pdSolutionsRouter from './api/pdSolutions.js';
import glMqrRouter from './api/glMqr.js';
import chatRouter from './api/chat.js';

const router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Mount routers for each service
router.use(healthRouter);
router.use(tiRouter);
router.use(pdoRouter);
router.use(solutionsRouter);
router.use(pdSolutionsRouter);
router.use(glMqrRouter);
router.use(chatRouter);

export default router;
