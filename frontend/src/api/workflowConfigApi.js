import API from "./api";

/**
 * Fetch all active approvers.
 */
export const getApprovers = () =>
    API.get("/workflow-config/approvers").then(res => res.data);
