/**
 * Runtime Environment Configuration
 *
 * This file is loaded as a plain <script> in index.html BEFORE the app bundle,
 * so values here are available via window._env_ at startup without a rebuild.
 *
 * To change the target environment, update this file only — no code changes needed.
 */
window._env_ = {

    // ── Backend Base URL ──────────────────────────────────────────────────────
    VITE_BACKEND_URL: "http://localhost:5000",

    // ── Active Tool ───────────────────────────────────────────────────────────
    VITE_TOOL: "sage"
};
