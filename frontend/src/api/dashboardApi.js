// features/dashboard/api/dashboardApi.js
import API from "./api";

export const getSummary = () => API.get("/dashboard/summary").then(res => res.data);

export const getAging = () => API.get("/dashboard/aging").then(res => res.data);

export const getStatusBreakdown = () => API.get("/dashboard/status_breakdown").then(res => res.data);

export const getVendors = () => API.get("/dashboard/vendors").then(res => res.data);

export const getTopVendors = () => API.get("/dashboard/top_vendors").then(res => res.data);

export const getPayments = () => API.get("/dashboard/payments").then(res => res.data);