/**
 * Resolves the correct backend base URL based on the current frontend host.
 *
 * Host → backend mapping is driven by `HOST_CONFIG` in public/config.js
 * (window._env_), so changing the target environment only requires editing
 * that one file.
 *
 * @returns {string} The backend base URL (e.g. "http://localhost:8015")
 */
import { getEnvValue } from './envHelper';

export function getBackendURL() {
    const env = window._env_ || {};
    return getEnvValue(env, 'VITE_BACKEND_URL') || 
           getEnvValue(import.meta.env, 'VITE_BACKEND_URL') || 
           "";
}
