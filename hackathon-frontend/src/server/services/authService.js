import crypto from 'crypto';

import { config } from '../config/env.js';

export const SESSION_COOKIE = 'qm_session';
const SESSION_DURATION_SECONDS = 12 * 60 * 60;

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.sessionCookieSecure,
        path: '/',
    };
}

function sign(payload) {
    return crypto
        .createHmac('sha256', config.sessionSecret)
        .update(payload)
        .digest('base64url');
}

function createSession(user) {
    const iat = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
        JSON.stringify({
            ...user,
            iat,
            exp: iat + SESSION_DURATION_SECONDS,
        }),
    ).toString('base64url');

    return `${payload}.${sign(payload)}`;
}

export function readSession(token) {
    if (typeof token !== 'string') return null;

    const [payload, suppliedSignature, ...extra] = token.split('.');
    if (!payload || !suppliedSignature || extra.length) return null;

    const expected = Buffer.from(sign(payload), 'base64url');
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    if (
        supplied.length !== expected.length ||
        !crypto.timingSafeEqual(supplied, expected)
    ) {
        return null;
    }

    try {
        const session = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8'),
        );
        if (
            !session ||
            typeof session.wwid !== 'string' ||
            typeof session.name !== 'string' ||
            typeof session.email !== 'string' ||
            !['olb', 'manual'].includes(session.source) ||
            !Number.isInteger(session.iat) ||
            !Number.isInteger(session.exp) ||
            session.exp <= Math.floor(Date.now() / 1000)
        ) {
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

export function getSession(req) {
    return readSession(req.cookies?.[SESSION_COOKIE]);
}

export function publicUser(session) {
    return {
        wwid: session.wwid,
        name: session.name,
        email: session.email,
        source: session.source,
    };
}

export function createSessionCookie(res, user) {
    res.cookie(SESSION_COOKIE, createSession(user), cookieOptions());
}

export function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export function validateProfile(body) {
    const errors = [];
    const wwid = typeof body?.wwid === 'string' ? body.wwid.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const source = body?.source;

    if (!/^\d{6,12}$/.test(wwid)) errors.push('wwid');
    if (
        !name ||
        name.length > 100 ||
        /[\u0000-\u001f\u007f-\u009f]/.test(name)
    ) {
        errors.push('name');
    }
    if (
        !email ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        errors.push('email');
    }
    if (!['olb', 'manual'].includes(source)) errors.push('source');

    if (errors.length) return { fields: errors };
    return { user: { wwid, name, email, source } };
}

export function originGuard(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return next();
    }

    const origin = req.get('Origin');
    if (!origin) return next();

    try {
        if (new URL(origin).host.toLowerCase() === req.get('host').toLowerCase()) {
            return next();
        }
    } catch {
        // Reject malformed origins below.
    }

    return res.status(403).json({ code: 'bad_origin' });
}

export function requireSession(req, res, next) {
    if (req.path === '/auth' || req.path.startsWith('/auth/')) return next();

    const session = getSession(req);
    if (!session) {
        return res.status(401).json({ code: 'unauthenticated' });
    }

    req.user = publicUser(session);
    return next();
}