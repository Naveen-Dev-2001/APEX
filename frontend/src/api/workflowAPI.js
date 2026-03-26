import API from "./api";

const workflowAPI = {
    // Vendor Workflow
    getVendorWorkflows: async () => {
        const response = await API.get("/workflow-config/vendor");
        return response.data;
    },
    createVendorWorkflow: async (data) => {
        const response = await API.post("/workflow-config/vendor", data);
        return response.data;
    },
    updateVendorWorkflow: async (id, data) => {
        const response = await API.put(`/workflow-config/vendor/${id}`, data);
        return response.data;
    },
    deleteVendorWorkflow: async (id) => {
        const response = await API.delete(`/workflow-config/vendor/${id}`);
        return response.data;
    },
    getWorkflowVendors: async () => {
        const response = await API.get("/workflow-config/vendor/vendors");
        return response.data;
    },

    // Codification Workflow
    getCodificationWorkflows: async () => {
        const response = await API.get("/workflow-config/codification");
        return response.data;
    },
    createCodificationWorkflow: async (data) => {
        const response = await API.post("/workflow-config/codification", data);
        return response.data;
    },
    updateCodificationWorkflow: async (id, data) => {
        const response = await API.put(`/workflow-config/codification/${id}`, data);
        return response.data;
    },
    deleteCodificationWorkflow: async (id) => {
        const response = await API.delete(`/workflow-config/codification/${id}`);
        return response.data;
    },
    getLobs: async () => {
        const response = await API.get("/workflow-config/codification/lobs");
        return response.data;
    },
    getDepartments: async () => {
        const response = await API.get("/workflow-config/codification/departments");
        return response.data;
    },

    // Approvers
    getApprovers: async () => {
        const response = await API.get("/workflow-config/approvers");
        return response.data;
    }
};

export default workflowAPI;
