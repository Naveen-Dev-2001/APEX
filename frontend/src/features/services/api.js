import axios from "axios";

const baseURL =
    "http://localhost:8014" || window._env_?.VITE_BACKEND_URL ||
    import.meta.env.VITE_BACKEND_URL;

const API = axios.create({
    baseURL: baseURL,
    headers: {
        "Content-Type": "application/json"
    }
});

export default API;