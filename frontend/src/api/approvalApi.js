import API from "./api";

/**
 * Fetch all unapproved invoices.
 * Note: Currently filtering on the frontend based on the status 'waiting_approval'
 */
export const getUnapprovedInvoices = ({ skip = 0, limit = 15, sort_by = "uploaded_at", sort_dir = "desc" } = {}) =>
    API.get(`/invoices/`, { 
        params: { 
            skip, 
            limit, 
            sort_by,
            sort_dir,
            filters: JSON.stringify({ approvals_view: true }) 
        } 
    }).then(res => res.data);

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
