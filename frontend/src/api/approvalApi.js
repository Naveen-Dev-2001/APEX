import API from "./api";

/**
 * Fetch all unapproved invoices.
 * Note: Currently filtering on the frontend based on the status 'waiting_approval'
 */
export const getUnapprovedInvoices = (skip = 0, limit = 1000) =>
    API.get(`/invoices/`, { 
        params: { 
            skip, 
            limit, 
            filters: JSON.stringify({ approvals_view: true }) 
        } 
    }).then(res => {
        // The backend returns { data: [...], total: ... }
        const invoices = Array.isArray(res.data?.data) ? res.data.data : 
                         (Array.isArray(res.data) ? res.data : []);
        return invoices; // Filtering now handled by backend
    });

/**
 * Approve or reject an invoice.
 * @param {number} invoiceId 
 * @param {string} status 'approved', 'rejected', or 'reworked'
 * @param {string} comment 
 */
export const updateApprovalStatus = (invoiceId, status, comment = "") =>
    API.put(`/invoices/${invoiceId}/status`, { status, comment });

/**
 * Recall an invoice back to coding stage.
 * @param {number} invoiceId 
 * @param {string} comment 
 */
export const recallInvoice = (invoiceId, comment = "") =>
    API.put(`/invoices/${invoiceId}/status`, { status: "waiting_coding", comment });
