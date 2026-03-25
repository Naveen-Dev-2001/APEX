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

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// ─── Master Data Service ────────────────────────────────────────────────────
const ENTITY_IDENTIFIER = 'Entity_Master';

export const masterDataService = {
    /** Fetch all entity master rows from DB */
    async getEntityMasterData() {
        const res = await API.get(`/master/sheet/${ENTITY_IDENTIFIER}`);
        return res.data;
    },

    /** Add a new entity master row */
    async addEntityRow(newRow) {
        const res = await API.post(`/master/sheet/${ENTITY_IDENTIFIER}/add`, { new_row: newRow });
        return res.data;
    },

    /** Edit an existing entity master row (backend uses updated_row.id to find the record) */
    async editEntityRow(rowIndex, updatedRow) {
        const res = await API.patch(`/master/sheet/${ENTITY_IDENTIFIER}/edit`, {
            row_index: rowIndex,
            updated_row: updatedRow,
        });
        return res.data;
    },

    /** Delete a row by its list index (backend uses offset-based lookup) */
    async deleteEntityRow(rowIndex) {
        const res = await API.delete(`/master/sheet/${ENTITY_IDENTIFIER}/delete`, {
            params: { row_index: rowIndex },
        });
        return res.data;
    },
};

export default API;