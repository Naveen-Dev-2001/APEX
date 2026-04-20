/**
 * workflowActionsAPI.js
 * ---------------------
 * All approval-workflow action calls for the invoice top-bar.
 *
 * Base URL is handled by the shared `API` axios instance (which attaches
 * the Authorization header automatically via interceptors).
 */

import API from "./api";

const BASE = "/workflow/action";

const workflowActionsAPI = {
    /**
     * GET /workflow/action/status/{invoiceId}
     *
     * Returns ApproverUIStatus:
     * {
     *   invoice_id, current_status, current_level, workflow_type,
     *   can_approve, can_reject, can_rework, can_enable_editing, can_repost_sage,
     *   is_posting_approver, is_threshold_approver, is_finance_team,
     *   user_level, level_already_approved, already_acted,
     *   assigned_approvers, sage_post_error
     * }
     */
    getApproverUIStatus: (payload) =>
        API.post(`/workflow/action/status`, payload).then(res => res.data),
    /**
     * POST /workflow/action/approve/{invoiceId}
     * Body: { comment?: string }
     *
     * Returns ActionResponse:
     * { success, message, new_status, next_level?, sage_post_result? }
     *
     * Possible new_status values after approve:
     *   waiting_approval  → level advanced (more levels remain)
     *   approved          → all levels done, no Sage posting
     *   sage_posted       → posting approver approved + Sage success
     *   sage_post_failed  → posting approver approved + Sage failed
     */
    approve: (invoiceId, payload = {}) =>
        API.post(`${BASE}/approve/${invoiceId}`, payload).then((res) => res.data),

    /**
     * POST /workflow/action/reject/{invoiceId}
     * Body: { comment?: string }
     *
     * Returns ActionResponse: { success, message, new_status: "rejected" }
     * Terminal — no further actions possible after rejection.
     */
    reject: (invoiceId, payload = {}) =>
        API.post(`${BASE}/reject/${invoiceId}`, payload).then((res) => res.data),

    /**
     * POST /workflow/action/rework/{invoiceId}
     * Body: { comment?: string }
     *
     * Returns ActionResponse: { success, message, new_status: "reworked", next_level }
     *
     * Error shape when no previous finance approver exists:
     *   HTTP 400 → { detail: { code: "NO_FINANCE_APPROVER", message: "..." } }
     *   Frontend should show a Modal.warning() with detail.message.
     */
    rework: (invoiceId, payload = {}) =>
        API.post(`${BASE}/rework/${invoiceId}`, payload).then((res) => res.data),

    /**
     * POST /workflow/action/enable-editing/{invoiceId}
     * Body: { comment?: string }
     *
     * Finance-team only. Unlocks all invoice tabs for the current user.
     * Invoice status stays the same; frontend sets editingEnabled = true.
     *
     * Returns ActionResponse: { success, message, new_status (unchanged) }
     */
    enableEditing: (invoiceId, payload = {}) =>
        API.post(`${BASE}/enable-editing/${invoiceId}`, payload).then((res) => res.data),

    /**
     * POST /workflow/action/repost-sage/{invoiceId}
     * Body: { comment?: string }
     *
     * Available only when current_status === "sage_post_failed" and
     * the logged-in user is the posting approver (can_repost_sage === true).
     *
     * Returns ActionResponse:
     *   success  → { success: true,  new_status: "sage_posted",       sage_post_result }
     *   failure  → { success: false, new_status: "sage_post_failed",  sage_post_result }
     */
    repostSage: (invoiceId, payload = {}) =>
        API.post(`${BASE}/repost-sage/${invoiceId}`, payload).then((res) => res.data),

    /**
     * POST /workflow/action/recall/{invoiceId}
     * Body: { comment?: string }
     *
     * Coder only. Recalls the invoice from Level 1 approval back to waiting_coding.
     */
    recall: (invoiceId, payload = {}) =>
        API.post(`${BASE}/recall/${invoiceId}`, payload).then((res) => res.data),
};

export default workflowActionsAPI;