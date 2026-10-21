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
app.use(cors());
app.use(cookieParser());
app.use(express.json());

// API routes
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
