import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine which .env file to load based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = `.env.${nodeEnv}`;

// Construct path to the .env file (two directories up from this file)
const envPath = path.resolve(__dirname, '../../../', envFile);

// Load environment variables from the appropriate .env file
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.warn(`Failed to load ${envFile}: ${result.error}`);
}

export const config = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    djangoBaseUrl: process.env.DJANGO_BASE_URL,
    encryptionKey: process.env.VITE_ENCRYPTION_KEY,
};

// Log to confirm variables are loaded
console.log('Environment config loaded:', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    djangoBaseUrl: config.djangoBaseUrl,
    encryptionKey: config.encryptionKey,
});
