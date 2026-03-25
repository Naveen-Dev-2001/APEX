import API from "./api";

export const getInvoices = ({ skip = 0, limit = 10 } = {}) =>
    API.get(`/invoices/?skip=${skip}&limit=${limit}`).then(res => res.data);