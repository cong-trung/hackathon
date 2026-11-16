import express from 'express';
import {
    approveUser,
    changePassword,
    changeUserRole,
    disableUser,
    getMe,
    getUsers,
    guest,
    login,
    logout,
    rejectUser,
    requestAccount,
} from '../../services/authService.js';

const router = express.Router();

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/i;

router.param('username', (req, res, next, username) => {
    if (!USERNAME_PATTERN.test(username)) {
        return res.status(400).json({
            detail: { code: 'invalid_username', message: 'Invalid username.' },
        });
    }
    return next();
});

router.post('/auth/login', login);
router.post('/auth/guest', guest);
router.post('/auth/logout', logout);
router.post('/auth/request-account', requestAccount);
router.post('/auth/change-password', changePassword);
router.get('/auth/me', getMe);
router.get('/auth/users', getUsers);
router.post('/auth/users/:username/approve', approveUser);
router.post('/auth/users/:username/reject', rejectUser);
router.post('/auth/users/:username/disable', disableUser);
router.patch('/auth/users/:username/role', changeUserRole);

export default router;