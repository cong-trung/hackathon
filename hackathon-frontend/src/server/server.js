import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';

import { config } from './config/env.js';
// import { initializeDatabase } from './db/init-db.js';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mode = config.nodeEnv;
const PORT = config.port;
const HOST = '0.0.0.0';

const app = express();
app.use(cors({ credentials: false }));
app.use(cookieParser());
app.use(express.json());

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const configuredOrigins = new Set(
    config.allowedOrigins.map((origin) => {
        try {
            return new URL(origin).origin;
        } catch {
            return '';
        }
    }),
);

function isAllowedOrigin(origin, req) {
    let parsedOrigin;
    try {
        const parsed = new URL(origin);
        if (parsed.origin !== origin) return false;
        parsedOrigin = parsed.origin;
    } catch {
        return false;
    }

    let requestOrigin;
    try {
        requestOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin;
    } catch {
        requestOrigin = '';
    }
    return parsedOrigin === requestOrigin || configuredOrigins.has(parsedOrigin);
}

function protectApiMutations(req, res, next) {
    if (!mutatingMethods.has(req.method)) return next();
    if (!req.is('application/json')) {
        return res.status(415).json({ code: 'unsupported_media_type' });
    }

    const origin = req.get('Origin');
    const allowedOrigin = origin ? isAllowedOrigin(origin, req) : false;
    if (origin && !allowedOrigin) {
        return res.status(403).json({ code: 'bad_origin' });
    }
    const fetchSite = req.get('Sec-Fetch-Site');
    if (
        ['cross-site', 'same-site'].includes(fetchSite) &&
        !allowedOrigin
    ) {
        return res.status(403).json({ code: 'bad_origin' });
    }
    return next();
}

// API routes
app.use('/api', protectApiMutations);
app.use('/api', apiRoutes);

// Serve static files in production mode
if (mode === 'production') {
    app.use(express.static(path.join(__dirname, '../../../dist')));
}

ViteExpress.config({ mode });

const server = app.listen(PORT, HOST, () => {
    console.log(`Server running in ${mode} mode at http://${HOST}:${PORT}`);
});

ViteExpress.bind(app, server);
