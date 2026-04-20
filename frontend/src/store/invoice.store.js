import { create } from "zustand";

export const useInvoiceStore = create((set, get) => ({

    invoiceSection: 1,
    setInvoiceSection: (section) => set({ invoiceSection: section }),

    entityList: [],
    setEntityList: (entities) => set({ entityList: entities }),

    selectedEntity: null,
    setSelectedEntity: (entity) => set({ selectedEntity: entity }),

    view: "condensed",
    setView: (view) => set({ view }),

    searchQuery: "",
    setSearchQuery: (query) => set({ searchQuery: query, skip: 0 }),

    sortColumn: "uploaded_at",
    sortDirection: "desc",
    setSort: (column, direction) => set({ sortColumn: column, sortDirection: direction }),

    skip: 0,
    setSkip: (skip) => set({ skip }),

    limit: 10,
    setLimit: (limit) => set({ limit }),

    viewInvoiceId: null,
    setViewInvoiceId: (id) => set({ viewInvoiceId: id }),

    fileName: "",
    setFileName: (name) => set({ fileName: name }),

    isModalOpen: false,
    setIsModalOpen: (open) => set({ isModalOpen: open }),

    // Invoice View Screen State
    tabList: ["Quick View", "All Fields", "GL Summary", "Workflow", "Audit Trail", "Coding"],

    invoiceActiveTab: "Quick View",
    setInvoiceActiveTab: (tab) => set({ invoiceActiveTab: tab }),

    selectedVendorId: null,
    setSelectedVendorId: (vendorId) => set({ selectedVendorId: vendorId }),

    // =============================
    //  QUICK VIEW - FORM DATA
    // =============================
    quickViewFormData: {
        vendorId: "",
        vendorName: "",
        invoiceNumber: "",
        invoiceDate: "",
        dueDate: "",
        paymentTerms: "",
        invoiceCurrency: "",
        exchangeRate: "",
        totalAmount: "",
        totalPayable: "",
        amountPaid: "",
        memo: "",
        invoiceType: "",
        poNumber: "",
        paymentMethod: "",
        costCenter: "",
        serviceStartDate: "",
        serviceEndDate: "",
        vendorAddress: "",
        vendorCountry: "",
        vendorTaxId: "",
        vendorEmail: "",
        vendorPhone: "",
        vendorBankName: "",
        vendorBankAccount: "",
        vendorContactPerson: "",
        clientName: "",
        billingAddress: "",
        shippingAddress: "",
        phoneNumber: "",
        email: "",
        clientTaxId: "",
        contactPerson: "",
        totalTaxAmount: "",
        cgst: "",
        sgst: "",
        igst: "",
        withholdingTax: "",
        subtotal: "",
        shippingFees: "",
        surcharges: "",
        totalInvoiceAmount: "",
        amountDue: "",
        notes: "",
        qrOrIrn: "",
        companyRegistrationNumber: "",
        gstEligibility: "",
        tdsApplicability: "",
        tdsRate: "",
        tdsSection: "",
        lineGrouping: "",
    },

    isDuplicate: false,
    setIsDuplicate: (isDuplicate) => set({ isDuplicate }),

    duplicateMessage: "",
    setDuplicateMessage: (msg) => set({ duplicateMessage: msg }),

    // ─────────────────────────────────────────────────────────────────────────
    // _syncSystemRows
    //
    // Rebuilds the GST and (conditionally) TDS system rows at the END of
    // the line-items list.
    //
    // GUARD: if isModified === true the invoice was already saved with
    // calculated values, so we preserve whatever is in the system rows
    // and do NOT recalculate.
    //
    // NOTE: This function never touches regular rows or applies line grouping.
    // Line grouping is handled exclusively in setQuickViewLineItems (load time).
    // ─────────────────────────────────────────────────────────────────────────
    _syncSystemRows: (formData, lineItems, isModified = false) => {
        if (!formData || !lineItems?.length) return lineItems ?? [];

        const regularItems = lineItems.filter(i => !i.isSystemRow);
        const existingGstRow = lineItems.find(i => i.type === "GST");
        const existingTdsRow = lineItems.find(i => i.type === "TDS");

        const entityMaster = get().entityMaster;
        const gstLabel = entityMaster?.gst_applicable === true ? "Total GST" : "Total Tax";

        if (isModified) {
            // Preserve saved system rows exactly as-is
            const gstRow = existingGstRow ?? {
                id: "gst-row",
                type: "GST",
                description: gstLabel,
                qty: 1,
                unitPrice: 0,
                discount: 0,
                netAmount: 0,
                taxAmt: 0,
                isSystemRow: true,
                isNetAmountOverridden: false,
            };
            const systemRows = [gstRow, ...(existingTdsRow ? [existingTdsRow] : [])];
            return [...regularItems, ...systemRows];
        }

        // Recalculate from form fields
        const gstValue = parseFloat(formData?.totalTaxAmount || 0);
        const tdsRate = parseFloat(formData?.tdsRate || 0);
        const totalInvoiceAmount = parseFloat(
            formData?.totalInvoiceAmount || formData?.total_invoice_amount || 0
        );
        const tdsValue = -Math.abs(tdsRate * totalInvoiceAmount);
        const isTdsApplicable = formData?.tdsApplicability === "Yes";

        const gstRow = {
            id: "gst-row",
            type: "GST",
            description: gstLabel,
            qty: 1,
            unitPrice: gstValue,
            discount: 0,
            netAmount: gstValue,
            taxAmt: 0,
            isSystemRow: true,
            isNetAmountOverridden: false,
        };

        const tdsRow = {
            id: "tds-row",
            type: "TDS",
            description: "TDS Deduction",
            qty: 1,
            unitPrice: tdsValue,
            discount: 0,
            netAmount: tdsValue,
            taxAmt: 0,
            isSystemRow: true,
            isNetAmountOverridden: false,
        };

        const systemRows = [gstRow, ...(isTdsApplicable ? [tdsRow] : [])];
        return [...regularItems, ...systemRows];
    },

    originalLineItems: [],

    // ─────────────────────────────────────────────────────────────────────────
    // _applyLineGrouping
    //
    // Merges all regular rows into a single grouped row (first row's
    // description, summed numeric fields). Only called at initial load
    // when isModified === false and lineGrouping === "Yes".
    //
    // System rows are always passed through untouched.
    // ─────────────────────────────────────────────────────────────────────────
    _applyLineGrouping: (items, formData) => {
        const isLineGrouped = formData?.lineGrouping === "Yes";
        const isModified = formData?.isModified;

        // DO NOT group if already saved
        if (!isLineGrouped) return items;

        const regularItems = items.filter(i => !i.isSystemRow);
        const systemRows = items.filter(i => i.isSystemRow);

        if (regularItems.length === 0) return items;

        const firstRow = regularItems[0];

        const groupedRow = {
            ...firstRow,
            id: "grouped-1",
            description: firstRow.description, //  keep first row desc
            qty: regularItems.reduce((s, r) => s + (Number(r.qty) || 0), 0),
            unitPrice: regularItems.reduce((s, r) => s + (Number(r.unitPrice) || 0), 0),
            discount: regularItems.reduce((s, r) => s + (Number(r.discount) || 0), 0),
            netAmount: regularItems.reduce((s, r) => s + (Number(r.netAmount) || 0), 0),
            taxAmt: regularItems.reduce((s, r) => s + (Number(r.taxAmt) || 0), 0),
            isNetAmountOverridden: false,
        };

        return [groupedRow, ...systemRows];
    },

    // ── Update single field ──────────────────────────────────────────────────
    setQuickViewField: (key, value) =>
        set((state) => {
            const updatedFormData = {
                ...state.quickViewFormData,
                [key]: value,
            };

            const triggerKeys = [
                "totalTaxAmount",
                "tdsRate",
                "tdsApplicability",
                "totalInvoiceAmount",
                "total_invoice_amount",
            ];

            return { quickViewFormData: updatedFormData, };
        }),


    // ── Replace full form (used on initial load & vendor sync) ───────────────
    setQuickViewFormData: (dataOrUpdater) =>
        set((state) => {
            const updatedFormData =
                typeof dataOrUpdater === "function"
                    ? dataOrUpdater(state.quickViewFormData)
                    : dataOrUpdater;

            return { quickViewFormData: updatedFormData };
        }),






    resetQuickView: () => set({
        quickViewFormData: {},
        originalLineItems: [],
        selectedVendorId: null,
        activeInvoiceData: null,
    }),



    // =============================
    // PDF HIGHLIGHT
    // =============================
    highlightedField: null,
    setHighlightedField: (field) => set({ highlightedField: field }),

    activeInvoiceData: null,
    setActiveInvoiceData: (data) => set({ activeInvoiceData: data }),

    entityMaster: {},
    setEntityMaster: (data) => set({ entityMaster: data }),

    lineItems: [],
    setLineItems: (itemsOrUpdater) =>
        set((state) => ({
            lineItems: typeof itemsOrUpdater === "function"
                ? itemsOrUpdater(state.lineItems)
                : itemsOrUpdater,
        })),
}));