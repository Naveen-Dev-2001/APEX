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
    // Helper: recalculate GST & TDS system rows based on current formData
    // Called internally whenever formData fields that affect these rows change.
    // ─────────────────────────────────────────────────────────────────────────
    _syncSystemRows: (formData, lineItems) => {
        const gstValue = parseFloat(formData?.totalTaxAmount || 0);
        const tdsRate = parseFloat(formData?.tdsRate || 0);
        const totalInvoiceAmount = parseFloat(formData?.totalInvoiceAmount || formData?.total_invoice_amount || 0);
        // TDS deduction is negative
        const tdsValue = -Math.abs((tdsRate / 100) * totalInvoiceAmount);

        return lineItems.map((item) => {
            if (item.type === "GST") {
                return { ...item, unitPrice: gstValue, netAmount: gstValue };
            }
            if (item.type === "TDS") {
                return { ...item, unitPrice: tdsValue, netAmount: tdsValue };
            }
            return item;
        });
    },

    // ── Update single field ──────────────────────────────────────────────────
    setQuickViewField: (key, value) =>
        set((state) => {
            const updatedFormData = {
                ...state.quickViewFormData,
                [key]: value,
            };
            // Re-sync system rows if a relevant field changed
            const triggerKeys = ["totalTaxAmount", "tdsRate", "totalInvoiceAmount", "total_invoice_amount"];
            const updatedLineItems = triggerKeys.includes(key)
                ? get()._syncSystemRows(updatedFormData, state.quickViewLineItems)
                : state.quickViewLineItems;

            return { quickViewFormData: updatedFormData, quickViewLineItems: updatedLineItems };
        }),

    // ── Batch update multiple fields ─────────────────────────────────────────
    batchUpdateQuickViewFields: (updates) =>
        set((state) => {
            const updatedFormData = {
                ...state.quickViewFormData,
                ...updates,
            };
            const triggerKeys = ["totalTaxAmount", "tdsRate", "totalInvoiceAmount", "total_invoice_amount"];
            const hasTrigger = Object.keys(updates).some(k => triggerKeys.includes(k));
            const updatedLineItems = hasTrigger
                ? get()._syncSystemRows(updatedFormData, state.quickViewLineItems)
                : state.quickViewLineItems;

            return { quickViewFormData: updatedFormData, quickViewLineItems: updatedLineItems };
        }),

    // ── Replace full form or functional update (used by vendor sync) ─────────
    setQuickViewFormData: (dataOrUpdater) =>
        set((state) => {
            const updatedFormData =
                typeof dataOrUpdater === "function"
                    ? dataOrUpdater(state.quickViewFormData)
                    : dataOrUpdater;

            // Always re-sync system rows when entire formData is replaced
            const updatedLineItems = get()._syncSystemRows(updatedFormData, state.quickViewLineItems);

            return { quickViewFormData: updatedFormData, quickViewLineItems: updatedLineItems };
        }),

    // =============================
    //  QUICK VIEW - LINE ITEMS
    // Default includes GST & TDS system rows
    // =============================
    quickViewLineItems: [
        {
            id: 1,
            description: "SVC: TOLL FREE USAGE NO RRF",
            qty: 1,
            unitPrice: 16,
            discount: 0,
            netAmount: 16,
            taxAmt: 0,
            isNetAmountOverridden: false,
        },
        {
            id: 2,
            description: "Additional Local Number",
            qty: 21,
            unitPrice: 1.1,
            discount: 0,
            netAmount: 23.1,
            taxAmt: 0,
            isNetAmountOverridden: false,
        },
        {
            id: 3,
            description: "Local Number - Included",
            qty: 233,
            unitPrice: 0,
            discount: 0,
            netAmount: 0,
            taxAmt: 0,
            isNetAmountOverridden: false,
        },
        // ── System rows — always kept at the bottom ──────────────────────────
        {
            id: "gst-row",
            type: "GST",
            description: "Total GST",
            qty: 1,
            unitPrice: 0,
            discount: 0,
            netAmount: 0,
            taxAmt: 0,
            isSystemRow: true,
            isNetAmountOverridden: false,
        },
        {
            id: "tds-row",
            type: "TDS",
            description: "TDS Deduction",
            qty: 1,
            unitPrice: 0,
            discount: 0,
            netAmount: 0,
            taxAmt: 0,
            isSystemRow: true,
            isNetAmountOverridden: false,
        },
    ],

    // ── Update table cell + auto-calculation ─────────────────────────────────
    updateQuickViewLineItem: (id, key, value) =>
        set((state) => {
            const updatedItems = state.quickViewLineItems.map((item) => {
                if (item.id !== id) return item;

                let updated = { ...item, [key]: value };

                // ── Normal row calculation ───────────────────────────────────
                if (!item.isSystemRow) {
                    if (key === "netAmount") {
                        updated.isNetAmountOverridden = true;
                    }
                    if (["qty", "unitPrice", "discount"].includes(key)) {
                        updated.isNetAmountOverridden = false;
                    }
                    if (!updated.isNetAmountOverridden) {
                        const qty = Number(updated.qty) || 0;
                        const price = Number(updated.unitPrice) || 0;
                        const discount = Number(updated.discount) || 0;
                        updated.netAmount = qty * price - discount;
                    }
                }

                // ── GST system row: unitPrice drives netAmount ────────────────
                if (item.type === "GST") {
                    updated.netAmount = Number(updated.unitPrice) || 0;
                }

                // ── TDS system row: unitPrice drives netAmount ────────────────
                if (item.type === "TDS") {
                    updated.netAmount = Number(updated.unitPrice) || 0;
                }

                return updated;
            });

            return { quickViewLineItems: updatedItems };
        }),

    // ── Delete row (system rows can also be deleted if TDS toggled off) ──────
    deleteQuickViewLineItem: (id) =>
        set((state) => ({
            quickViewLineItems: state.quickViewLineItems.filter(i => i.id !== id),
        })),

    // ── Add new regular row — always inserted before system rows ─────────────
    addQuickViewLineItem: () =>
        set((state) => {
            const newItem = {
                id: Date.now(),
                description: "",
                qty: 1,
                unitPrice: 0,
                discount: 0,
                netAmount: 0,
                taxAmt: 0,
                lineType: "Expense",
                glCode: "",
                lob: "",
                department: "",
                customer: "",
                item: "",
                isNetAmountOverridden: false,
            };
            const regularItems = state.quickViewLineItems.filter(row => !row.isSystemRow);
            const systemRows = state.quickViewLineItems.filter(row => row.isSystemRow);
            return { quickViewLineItems: [...regularItems, newItem, ...systemRows] };
        }),

    setQuickViewLineItems: (items) => set({ quickViewLineItems: items }),

    // =============================
    // TOTAL CALCULATION
    // =============================
    recalculateQuickViewTotals: () => {
        const { quickViewLineItems } = get();
        const total = quickViewLineItems
            .filter(item => !item.isSystemRow)
            .reduce((sum, item) => sum + (Number(item.netAmount) || 0), 0);
        set((state) => ({
            quickViewFormData: {
                ...state.quickViewFormData,
                totalAmount: total.toFixed(2),
                totalPayable: total.toFixed(2),
            },
        }));
    },

    // =============================
    // PDF HIGHLIGHT
    // =============================
    highlightedField: null,
    setHighlightedField: (field) => set({ highlightedField: field }),

    activeInvoiceData: null,
    setActiveInvoiceData: (data) => set({ activeInvoiceData: data }),

    entityMaster: {},
    setEntityMaster: (data) => set({ entityMaster: data }),
}));