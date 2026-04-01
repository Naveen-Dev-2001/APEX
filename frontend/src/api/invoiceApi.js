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

export const deleteInvoice = (invoiceId) =>
    API.delete(`/invoices/${invoiceId}`).then(res => {
        return res.data;
    });

export const getInvoiceById = (invoiceId) =>
    API.get(`/invoices/${invoiceId}`).then(res => {
        console.log("res.data", res.data);

        return res.data;
    });

export const getVendorById = (vendorId) =>
    API.get(`/master/vendor/${vendorId}`).then(res => {
        return res.data;
    });

export const fetchAllVendors = () =>
    API.get("/master/getvendors").then(res => {
        return res.data;
    });

export const fetchEntityMaster = () =>
    API.get("/master/sheet/Entity_Master").then(res => {
        return res.data;
    })