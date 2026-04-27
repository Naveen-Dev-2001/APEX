window._env_ = {
    VITE_BACKEND_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? "http://localhost:8014"
        : "http://10.21.151.5:8014"
};