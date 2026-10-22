import { config } from '../config/env.js';
import { forwardRequest } from '../utils/forwardRequest.js';

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.nodeEnv === 'production',
        path: '/',
    };
}

function sendForwardError(res, error) {
    const status = error.response?.status;
    if (!status || status >= 500) {
        console.error('Backend auth proxy request failed:', error);
        return res
            .status(502)
            .json({ code: 'proxy_error', message: 'Backend unavailable' });
    }
    return res.status(status).json(error.response.data);
}

async function forwardJson(req, res, path, status = 200) {
    try {
        const result = await forwardRequest(path, req);
        return res.status(status).json(result);
    } catch (error) {
        return sendForwardError(res, error);
    }
}

export async function login(req, res) {
    try {
        const result = await forwardRequest('/auth/login', req);
        const maxAge = Math.max(
            0,
            new Date(result.expires_at).getTime() - Date.now(),
        );
        res.cookie('qm_token', result.token, {
            ...cookieOptions(),
            maxAge,
        });
        return res.json({ user: result.user, expires_at: result.expires_at });
    } catch (error) {
        return sendForwardError(res, error);
    }
}

export async function guest(req, res) {
    try {
        const result = await forwardRequest('/auth/guest', req);
        const maxAge = Math.max(
            0,
            new Date(result.expires_at).getTime() - Date.now(),
        );
        res.cookie('qm_token', result.token, {
            ...cookieOptions(),
            maxAge,
        });
        return res.json({ user: result.user, expires_at: result.expires_at });
    } catch (error) {
        return sendForwardError(res, error);
    }
}

export function logout(req, res) {
    res.clearCookie('qm_token', cookieOptions());
    return res.status(204).end();
}

export function requestAccount(req, res) {
    return forwardJson(req, res, '/auth/request-account', 201);
}

export async function getMe(req, res) {
    try {
        const result = await forwardRequest('/auth/me', req);
        return res.json(result);
    } catch (error) {
        if (error.response?.status === 401) {
            res.clearCookie('qm_token', cookieOptions());
        }
        return sendForwardError(res, error);
    }
}

export function getUsers(req, res) {
    return forwardJson(req, res, '/auth/users');
}

export function approveUser(req, res) {
    const username = encodeURIComponent(req.params.username);
    return forwardJson(req, res, `/auth/users/${username}/approve`);
}

export function rejectUser(req, res) {
    const username = encodeURIComponent(req.params.username);
    return forwardJson(req, res, `/auth/users/${username}/reject`);
}

export function disableUser(req, res) {
    const username = encodeURIComponent(req.params.username);
    return forwardJson(req, res, `/auth/users/${username}/disable`);
}