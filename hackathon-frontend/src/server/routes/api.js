import express from 'express';

import healthRouter from './api/health.js';
import tiRouter from './api/ti.js';
import pdoRouter from './api/pdo.js';
import solutionsRouter from './api/solutions.js';
import pdSolutionsRouter from './api/pdSolutions.js';
import glMqrRouter from './api/glMqr.js';
import chatRouter from './api/chat.js';
import {
    getPypcsModules,
    getPypcsQuestions,
    getPypcsVisibleQuestions,
    submitPypcsSubmission,
    getPypcsSubmissions,
    getPypcsSubmissionDetail,
    deletePypcsSubmission,
    submitPypcsMatrixSubmission,
} from '../services/pypcsService.js';

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
router.get('/pypcs/modules', getPypcsModules);
router.get('/pypcs/questions', getPypcsQuestions);
router.post('/pypcs/visible-questions', getPypcsVisibleQuestions);
router.post('/pypcs/submission', submitPypcsSubmission);
router.get('/pypcs/submissions', getPypcsSubmissions);
router.get('/pypcs/submissions/:submissionId', getPypcsSubmissionDetail);
router.delete('/pypcs/submissions/:submissionId', deletePypcsSubmission);
router.post('/pypcs/matrix-submission', submitPypcsMatrixSubmission);
export default router;
