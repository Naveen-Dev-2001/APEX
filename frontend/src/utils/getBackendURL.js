/**
 * Resolves the correct backend base URL based on the current frontend host.
 *
 * Host → backend mapping is driven by `HOST_CONFIG` in public/config.js
 * (window._env_), so changing the target environment only requires editing
 * that one file.
 *
 * @returns {string} The backend base URL (e.g. "http://localhost:8015")
 */
export function getBackendURL() {
    const env = window._env_ || {};
    const hostConfig = env.HOST_CONFIG || {};
    const envKey = hostConfig[window.location.host];

    if (envKey) {
        return env[envKey] || import.meta.env[envKey] || "";
    }

    // Fallback to the Sage backend if the host is not in HOST_CONFIG
    return env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || "";
}
