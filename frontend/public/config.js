/**
 * Runtime Environment Configuration
 *
 * This file is loaded as a plain <script> in index.html BEFORE the app bundle,
 * so values here are available via window._env_ at startup without a rebuild.
 *
 * To change the target environment, update this file only — no code changes needed.
 */
window._env_ = {

    // ── Backend Base URLs ─────────────────────────────────────────────────────
    // Sage (ERP) backend — served on port 8014
    VITE_BACKEND_URL: "http://localhost:8014",

    // Zoho backend — served on port 8015
    VITE_BACKEND_ZOHO_URL: "http://localhost:8015",

    // ── Host → Backend Mapping ────────────────────────────────────────────────
    // Maps the frontend host (origin) to the correct backend env key above.
    // Used by src/utils/getBackendURL.js to resolve the right API base URL
    // based on which port/domain the frontend is running on.
    HOST_CONFIG: {
        "localhost:3003": "VITE_BACKEND_URL",       // Sage frontend (dev)
        "localhost:3004": "VITE_BACKEND_ZOHO_URL",  // Zoho frontend (dev)

        // ── Production Hosts (uncomment when deploying) ───────────────────────
        // "apex.loandna.com":      "VITE_BACKEND_URL",       // Sage (prod)
        // "apex-zoho.loandna.com": "VITE_BACKEND_ZOHO_URL",  // Zoho (prod)
    }
};