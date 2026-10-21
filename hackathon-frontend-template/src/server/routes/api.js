import express from 'express';

import healthRouter from './api/health.js';

const router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// Mount routers for each service. Add new feature routers here, e.g.:
// router.use(featureRouter);
router.use(healthRouter);

export default router;
