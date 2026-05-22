import API from "./api";

export const getInvoices = (params = {}, options = {}) =>
    API.get(`/invoices/`, {
        params: {
            skip: params.skip || 0,
            limit: params.limit || 15,
            search: params.search || undefined,
            filters: params.filters ? JSON.stringify(params.filters) : undefined,
            sort_by: params.sort_by || "uploaded_at",
            sort_dir: params.sort_dir || "desc",
            // Server-side pagination must stay enabled for large datasets.
            show_all: params.show_all ?? false,
            tab: params.tab || undefined
        },
        signal: options.signal
    }).then(res => res.data);

export const getInvoiceFilterOptions = (column, filters = {}, tab = undefined, search = undefined) =>
    API.get(`/invoices/filter-options`, {
        params: { 
            column,
            filters: Object.keys(filters).length > 0 ? JSON.stringify(filters) : undefined,
            tab,
            search
        }
    }).then(res => res.data);

export const uploadInvoices = (formData, taskId, onUploadProgress, signal) => {
    return API.post(`/invoices/upload?task_id=${taskId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress, // axios will call this with { loaded, total }
        signal
    });
};

export const cancelUpload = (taskId) =>
    API.post(`/invoices/cancel-upload/${taskId}`).then(res => res.data);

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

export const getWorkflowData = async (invoiceId, params = {}) => {
    const res = await API.get(`/workflow/${invoiceId}`, { params });
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

export const saveInvoice = async (invoice_id, payload) => {
    // Ensure last_updated_at is included for concurrency control
    const res = await API.put(`/invoices/${invoice_id}`, payload)
    return res.data
}


export const fetchCodingSuggestions = async (invoiceId, vendorId = null) => {
    const params = vendorId ? { vendor_id: vendorId } : {};
    const res = await API.get(`/coding/${invoiceId}/suggestions`, { params });
    return res.data;
};

/**
 * Parallel batch fetcher for all critical invoice preview data.
 * Fires vendor detail, workflow, and coding suggestions simultaneously
 * using Promise.allSettled so a single failure doesn't block the rest.
 *
 * @param {object} opts
 * @param {number} opts.invoiceId
 * @param {string} opts.vendorId
 * @param {object} [opts.workflowParams]  - preview_vendor_id, preview_lob, preview_department_id
 * @returns {{ vendor, workflowData, codingSuggestions }}
 */
export const fetchInvoicePreviewData = async ({ invoiceId, vendorId, workflowParams = {} }) => {
    const [vendorRes, workflowRes, suggestionsRes] = await Promise.allSettled([
        vendorId ? API.get(`/master/vendor/${vendorId}`).then(r => r.data) : Promise.resolve(null),
        invoiceId ? API.get(`/workflow/${invoiceId}`, { params: workflowParams }).then(r => r.data) : Promise.resolve(null),
        invoiceId ? API.get(`/coding/${invoiceId}/suggestions`, { params: vendorId ? { vendor_id: vendorId } : {} }).then(r => r.data) : Promise.resolve([]),
    ]);

    return {
        vendor:            vendorRes.status === 'fulfilled'      ? vendorRes.value      : null,
        workflowData:      workflowRes.status === 'fulfilled'    ? workflowRes.value    : null,
        codingSuggestions: suggestionsRes.status === 'fulfilled' ? suggestionsRes.value : [],
    };
};

export const fetchDeletedInvoices = (params = {}) =>
    API.get(`/invoices/deleted`, {
        params: {
            skip: params.skip || 0,
            limit: params.limit || 50,
            entity: params.entity || undefined,
            vendor_id: params.vendor_id || undefined,
            invoice_number: params.invoice_number || undefined,
            sort_by: params.sort_by || "deleted_at",
            sort_dir: params.sort_dir || "desc",
            filters: params.filters ? JSON.stringify(params.filters) : undefined,
        }
    }).then(res => res.data);


export const fetchDeletedInvoiceById = (archiveId) =>
    API.get(`/invoices/deleted/${archiveId}`).then(res => res.data);

export const archiveInvoice = (invoiceId) =>
    API.post(`/invoices/${invoiceId}/archive`).then(res => res.data);

export const bulkDeleteInvoices = (invoiceIds) =>
    API.post(`/invoices/bulk-delete`, { invoice_ids: invoiceIds }).then(res => res.data);

export const bulkArchiveInvoices = (invoiceIds) =>
    API.post(`/invoices/bulk-archive`, { invoice_ids: invoiceIds }).then(res => res.data);

export const getDelegationInfo = (invoiceId) =>
    API.get(`/invoices/${invoiceId}/delegation-info`).then(res => res.data);

export const delegateInvoice = (invoiceId, payload) =>
    API.post(`/invoices/${invoiceId}/delegate`, payload).then(res => res.data);

export const saveCustomInvoiceWorkflow = (invoiceId, payload) =>
    API.put(`/workflow/custom/${invoiceId}`, payload).then(res => res.data);
