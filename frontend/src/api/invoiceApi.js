import API from "./api";

export const getInvoices = ({ skip = 0 } = {}) =>
    API.get(`/invoices/?skip=${skip}`).then(res => {
        return res.data;
    });

export const uploadInvoices = (formData, taskId, onUploadProgress) => {
    return API.post(`/invoices/upload?task_id=${taskId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress, // axios will call this with { loaded, total }
    });
};