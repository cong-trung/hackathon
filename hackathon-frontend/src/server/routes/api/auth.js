import express from 'express';

import {
    clearSessionCookie,
    createSessionCookie,
    getSession,
    publicUser,
    validateProfile,
} from '../../services/authService.js';

const router = express.Router();

router.post('/session', (req, res) => {
    const result = validateProfile(req.body);
    if (!result.user) {
        return res.status(400).json({
            code: 'invalid_profile',
            fields: result.fields,
        });
    }

    createSessionCookie(res, result.user);
    return res.status(200).json({ user: result.user });
});

router.get('/me', (req, res) => {
    const session = getSession(req);
    if (!session) {
        return res.status(401).json({ code: 'unauthenticated' });
    }

    return res.status(200).json({ user: publicUser(session) });
});

router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    return res.status(204).end();
});

export default router;