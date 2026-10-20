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
    updatePypcsQuestionDescription,
    getPypcsVisibleQuestions,
    getPypcsSubmissions,
    getPypcsSubmissionDetail,
    getPypcsSubmissionHistory,
    verifyPypcsEditPin,
    deletePypcsSubmission,
    submitPypcsMatrixSubmission,
    getPypcsActionItems,
    getPypcsActionItemOptions,
    createPypcsActionItem,
    updatePypcsActionItem,
    getPypcsProductActionMatrix,
    updatePypcsProductActionMatrixRow,
    exportPypcsProductActionMatrix,
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
router.patch('/pypcs/questions/:questionId', updatePypcsQuestionDescription);
router.post('/pypcs/visible-questions', getPypcsVisibleQuestions);
router.get('/pypcs/submissions', getPypcsSubmissions);
router.post('/pypcs/submissions/:submissionId/verify-edit-pin', verifyPypcsEditPin);
router.get('/pypcs/submissions/:submissionId/history', getPypcsSubmissionHistory);
router.get('/pypcs/submissions/:submissionId', getPypcsSubmissionDetail);
router.delete('/pypcs/submissions/:submissionId', deletePypcsSubmission);
router.post('/pypcs/matrix-submission', submitPypcsMatrixSubmission);
router.get('/pypcs/action-items/options', getPypcsActionItemOptions);
router.get('/pypcs/action-items', getPypcsActionItems);
router.post('/pypcs/action-items', createPypcsActionItem);
router.put('/pypcs/action-items/:nbr', updatePypcsActionItem);
router.get('/pypcs/product-action-matrix/export', exportPypcsProductActionMatrix);
router.get('/pypcs/product-action-matrix', getPypcsProductActionMatrix);
router.put('/pypcs/product-action-matrix/rows', updatePypcsProductActionMatrixRow);
export default router;
