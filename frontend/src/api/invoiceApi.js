import API from "./api";

export const getInvoices = (params = {}) =>
    API.get(`/invoices/`, {
        params: {
            skip: params.skip || 0,
            limit: params.limit || 10,
            search: params.search || undefined,
            sort_by: params.sort_by || "uploaded_at",
            sort_dir: params.sort_dir || "desc",
            show_all: params.show_all ?? true
        }
    }).then(res => res.data);

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

export const getInvoicePdf = (invoiceId) =>
    API.get(`/invoices/${invoiceId}/file`, { responseType: 'blob' }).then(res => {
        return res.data;
    });

export const checkDuplicate = (payload) =>
    API.post(`/invoices/check-duplicate`, payload).then(res => {
        return res.data;
    });

export const getWorkflowData = async (invoiceId) => {
    const res = await API.get(`/workflow/${invoiceId}`);
    return res.data;
};

export const getworkflowApprovers = async (invoiceId) => {
    const res = await API.get(`/workflow/approvers/${invoiceId}`);
    return res.data;
};

export const getAudit = async (invoice_id) => {
    const res = await API.get(`/api/audit/${invoice_id}`)
    return res.data;
}