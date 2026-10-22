import express from 'express';
import {
    approveUser,
    disableUser,
    getMe,
    getUsers,
    login,
    logout,
    rejectUser,
    requestAccount,
} from '../../services/authService.js';

const router = express.Router();

router.post('/auth/login', login);
router.post('/auth/logout', logout);
router.post('/auth/request-account', requestAccount);
router.get('/auth/me', getMe);
router.get('/auth/users', getUsers);
router.post('/auth/users/:username/approve', approveUser);
router.post('/auth/users/:username/reject', rejectUser);
router.post('/auth/users/:username/disable', disableUser);

export default router;