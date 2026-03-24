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

// Add token to requests
API.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add Entity header if needed
    const entity = sessionStorage.getItem('selected_entity');
    if (entity) {
      config.headers['X-Entity'] = entity;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default API;