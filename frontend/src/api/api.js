import axios from "axios";

const baseURL =
    window._env_?.VITE_BACKEND_URL ||
    import.meta.env.VITE_BACKEND_URL;

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

export default API;