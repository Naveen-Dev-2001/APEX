import API from "./api";

/**
 * Fetch all delegations.
 */
export const getDelegations = () =>
    API.get("/delegations/").then(res => res.data);

/**
 * Create a new delegation record.
 * @param {object} payload { original_approver, substitute_approver, start_date, end_date }
 */
export const createDelegation = (payload) =>
    API.post("/delegations/", payload);

/**
 * Delete a delegation.
 * @param {number} delegationId 
 */
export const deleteDelegation = (delegationId) =>
    API.delete(`/delegations/${delegationId}`);
