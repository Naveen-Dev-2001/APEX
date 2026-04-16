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

                const res = await axios.post(`${baseURL}/auth/refresh?refresh_token=${refreshToken}`);
                
                if (res.data?.access_token) {
                    const { access_token, refresh_token } = res.data;
                    sessionStorage.setItem('access_token', access_token);
                    if (refresh_token) sessionStorage.setItem('refresh_token', refresh_token);
                    
                    originalRequest.headers.Authorization = `Bearer ${access_token}`;
                    return API(originalRequest);
                }
            } catch (refreshError) {
                sessionStorage.clear();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export default API;