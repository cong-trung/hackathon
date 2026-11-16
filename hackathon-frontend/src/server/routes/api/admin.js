import express from 'express';
import { getAdminChanges, exportAdminChangesCsv } from '../../services/adminService.js';

const router = express.Router();

router.get('/admin/changes', getAdminChanges);
router.get('/admin/changes/export.csv', exportAdminChangesCsv);

export default router;
