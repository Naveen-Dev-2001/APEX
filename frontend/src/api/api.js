import axios from "axios";

// Change baseURL if frontend host as apex.loandna.com then take VITE_BACKEND_URL else if apex-zoho.loandna.com then take VITE_BACKEND_ZOHO_URL
const hostConfig = {
    "localhost:3003": "VITE_BACKEND_URL",
    "localhost:3004": "VITE_BACKEND_ZOHO_URL",
    // "apex.loandna.com": "VITE_BACKEND_URL",
    // "apex-zoho.loandna.com": "VITE_BACKEND_ZOHO_URL",
};

const envKey = hostConfig[window.location.host];

const baseURL = envKey
    ? (window._env_?.[envKey] || import.meta.env[envKey])
    : "";

const API = axios.create({
    baseURL: baseURL,
    headers: {
        "Content-Type": "application/json"
    }
});

API.interceptors.request.use(
    (config) => {
        const token = sessionStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Add Entity header
        const entity = sessionStorage.getItem('selected_entity');
        if (entity) {
            config.headers['X-Entity'] = entity;
        }

        // Add Active Role header
        const activeRole = sessionStorage.getItem('active_role');
        if (activeRole) {
            config.headers['X-Active-Role'] = activeRole;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

API.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = sessionStorage.getItem('refresh_token');
                if (!refreshToken) throw new Error("No refresh token");

                const res = await axios.post(`${baseURL}/auth/refresh`, {
                    refresh_token: refreshToken
                });

                if (res.data?.access_token) {
                    const { access_token, refresh_token } = res.data;
                    sessionStorage.setItem('access_token', access_token);
                    if (refresh_token) sessionStorage.setItem('refresh_token', refresh_token);

                    originalRequest.headers.Authorization = `Bearer ${access_token}`;
                    return API(originalRequest);
                }
            } catch (refreshError) {
                console.error("Token refresh failed:", refreshError);
                sessionStorage.clear();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export default API;
