import API from "./api";

const ENTITY_IDENTIFIER = 'Entity_Master';
const VENDOR_IDENTIFIER = 'Vendor_Master';
const TDS_IDENTIFIER = 'TDS_Rates';
const GL_IDENTIFIER = 'GL';
const LOB_IDENTIFIER = 'LOB';
const DEPARTMENT_IDENTIFIER = 'Department';

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

    /** Upload an entity master file */
    async uploadEntityMaster(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await API.post(`/master/upload`, formData, {
            params: { tab_name: ENTITY_IDENTIFIER },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data;
    },

    // ─── Vendor Master ───────────────────────────────────────────────────────
    /** Fetch all vendor master rows from DB */
    async getVendorMasterData() {
        const res = await API.get(`/master/sheet/${VENDOR_IDENTIFIER}`);
        return res.data;
    },

    /** Upload a vendor master file */
    async uploadVendorMaster(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await API.post(`/master/upload`, formData, {
            params: { tab_name: VENDOR_IDENTIFIER },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data;
    },

    /** Add a new vendor master row */
    async addVendorRow(newRow) {
        const res = await API.post(`/master/sheet/${VENDOR_IDENTIFIER}/add`, { new_row: newRow });
        return res.data;
    },

    /** Edit an existing vendor master row */
    async editVendorRow(rowIndex, updatedRow) {
        const res = await API.patch(`/master/sheet/${VENDOR_IDENTIFIER}/edit`, {
            row_index: rowIndex,
            updated_row: updatedRow,
        });
        return res.data;
    },

    /** Delete a vendor row */
    async deleteVendorRow(rowIndex) {
        const res = await API.delete(`/master/sheet/${VENDOR_IDENTIFIER}/delete`, {
            params: { row_index: rowIndex },
        });
        return res.data;
    },

    // ─── TDS Rates ──────────────────────────────────────────────────────────
    /** Fetch all TDS rates from DB */
    async getTDSRatesData() {
        const res = await API.get(`/master/sheet/${TDS_IDENTIFIER}`);
        return res.data;
    },

    /** Add a new TDS rate row */
    async addTDSRateRow(newRow) {
        const res = await API.post(`/master/sheet/${TDS_IDENTIFIER}/add`, { new_row: newRow });
        return res.data;
    },

    /** Edit an existing TDS rate row */
    async editTDSRateRow(rowIndex, updatedRow) {
        const res = await API.patch(`/master/sheet/${TDS_IDENTIFIER}/edit`, {
            row_index: rowIndex,
            updated_row: updatedRow,
        });
        return res.data;
    },

    /** Delete a TDS rate row */
    async deleteTDSRateRow(rowIndex) {
        const res = await API.delete(`/master/sheet/${TDS_IDENTIFIER}/delete`, {
            params: { row_index: rowIndex },
        });
        return res.data;
    },

    /** Upload a TDS rates file */
    async uploadTDSRatesData(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await API.post(`/master/upload`, formData, {
            params: { tab_name: TDS_IDENTIFIER },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data;
    },

    // ─── GL Master ──────────────────────────────────────────────────────────
    /** Fetch all GL master rows from DB */
    async getGLMasterData() {
        const res = await API.get(`/master/sheet/${GL_IDENTIFIER}`);
        return res.data;
    },

    /** Add a new GL master row */
    async addGLRow(newRow) {
        const res = await API.post(`/master/sheet/${GL_IDENTIFIER}/add`, { new_row: newRow });
        return res.data;
    },

    /** Edit an existing GL master row */
    async editGLRow(rowIndex, updatedRow) {
        const res = await API.patch(`/master/sheet/${GL_IDENTIFIER}/edit`, {
            row_index: rowIndex,
            updated_row: updatedRow,
        });
        return res.data;
    },

    /** Delete a GL row */
    async deleteGLRow(rowIndex) {
        const res = await API.delete(`/master/sheet/${GL_IDENTIFIER}/delete`, {
            params: { row_index: rowIndex },
        });
        return res.data;
    },

    /** Upload a GL master file */
    async uploadGLMaster(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await API.post(`/master/upload`, formData, {
            params: { tab_name: GL_IDENTIFIER },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data;
    },

    // ─── LOB Master ──────────────────────────────────────────────────────────
    /** Fetch all LOB master rows from DB */
    async getLOBMasterData() {
        const res = await API.get(`/master/sheet/${LOB_IDENTIFIER}`);
        return res.data;
    },

    /** Add a new LOB master row */
    async addLOBRow(newRow) {
        const res = await API.post(`/master/sheet/${LOB_IDENTIFIER}/add`, { new_row: newRow });
        return res.data;
    },

    /** Edit an existing LOB master row */
    async editLOBRow(rowIndex, updatedRow) {
        const res = await API.patch(`/master/sheet/${LOB_IDENTIFIER}/edit`, {
            row_index: rowIndex,
            updated_row: updatedRow,
        });
        return res.data;
    },

    /** Delete a LOB row */
    async deleteLOBRow(rowIndex) {
        const res = await API.delete(`/master/sheet/${LOB_IDENTIFIER}/delete`, {
            params: { row_index: rowIndex },
        });
        return res.data;
    },

    /** Upload an LOB master file */
    async uploadLOBMaster(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await API.post(`/master/upload`, formData, {
            params: { tab_name: LOB_IDENTIFIER },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data;
    },

    // ─── Department Master ──────────────────────────────────────────────────
    /** Fetch all Department master rows from DB */
    async getDepartmentMasterData() {
        const res = await API.get(`/master/sheet/${DEPARTMENT_IDENTIFIER}`);
        return res.data;
    },

    /** Add a new Department master row */
    async addDepartmentRow(newRow) {
        const res = await API.post(`/master/sheet/${DEPARTMENT_IDENTIFIER}/add`, { new_row: newRow });
        return res.data;
    },

    /** Edit an existing Department master row */
    async editDepartmentRow(rowIndex, updatedRow) {
        const res = await API.patch(`/master/sheet/${DEPARTMENT_IDENTIFIER}/edit`, {
            row_index: rowIndex,
            updated_row: updatedRow,
        });
        return res.data;
    },

    /** Delete a Department row */
    async deleteDepartmentRow(rowIndex) {
        const res = await API.delete(`/master/sheet/${DEPARTMENT_IDENTIFIER}/delete`, {
            params: { row_index: rowIndex },
        });
        return res.data;
    },

    /** Upload a Department master file */
    async uploadDepartmentMaster(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await API.post(`/master/upload`, formData, {
            params: { tab_name: DEPARTMENT_IDENTIFIER },
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data;
    },

    /** Delete all data for a specific tab */
    async deleteTabData(tabName) {
        const identifier = tabName === 'Entity Master' ? ENTITY_IDENTIFIER 
                        : tabName === 'Vendor Master' ? VENDOR_IDENTIFIER 
                        : tabName === 'TDS Rates' ? TDS_IDENTIFIER 
                        : tabName === 'GL Master' ? GL_IDENTIFIER 
                        : tabName === 'LOB Master' ? LOB_IDENTIFIER 
                        : tabName === 'Department Master' ? DEPARTMENT_IDENTIFIER : tabName;
        const res = await API.delete(`/master/files/${identifier}`);
        return res.data;
    },
};
